# =============================================================================
# parche83 — ASENTAR EL DINERO DEL PEDIDO Y SABER QUÉ SE LE DEBE A CADA TIENDA
#            (punto 8 de la §3)
#
# QUÉ PASA HOY: al entregar, el pedido queda `paid`… y no hay ni una línea de dinero. Cuánto se queda la
# plataforma y cuánto hay que pagarle a la tienda **no está en ningún sitio**: sin eso no hay comisión,
# no hay panel del vendedor y no hay nada que conciliar. Y una entrega en efectivo la cobra una persona
# en mano, así que sin registro no hay forma de saber quién tiene el dinero.
#
# QUÉ HACE ESTE PARCHE:
#   · `asentarDinero(tx, o)` se llama **dentro de la misma transacción** que la entrega (en las DOS vías:
#     el botón de la tienda y el código de contra entrega). Congela el desglose del pedido en
#     `lifebook.order_fees` y escribe el **asiento de doble partida** en `lifebook.ledger_entries`:
#
#        caja                 debe   total                       (lo que entra)
#        a_pagar_tienda       haber  productos − comisión
#        comision_plataforma  haber  comisión
#        a_pagar_reparto      haber  la entrega (no se comisiona)
#
#     Suma del debe = suma del haber, siempre. Es la comprobación que va en las pruebas.
#   · La comisión sale de `lifebook.commerce_fee_config` (en la base, para poder cambiarla sin desplegar)
#     y se calcula con `orders-fees.ts`, que es una función pura y probada con números.
#   · Si el pedido ya estaba asentado, **no se toca nada**: el `ON CONFLICT (order_id) DO NOTHING` evita
#     que un reintento cuente el dinero dos veces.
#   · `saldoDeMiTienda` (lo que la plataforma le debe a MI tienda), `liquidarTienda` (pago manual, solo el
#     admin, con su registro) y `resumenDeLaPlataforma` (la caja del dueño: comisión total, lo pendiente
#     y el **cuadre del libro**, que avisa si debe y haber no coinciden).
#   · El detalle del pedido enseña al VENDEDOR su comisión y lo que va a cobrar (no al comprador).
#
# Uso en el servidor:  python3 /root/parche83-dinero-del-comercio.py
# =============================================================================
import shutil
import sys

SELLO = 'dinero-del-comercio-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'
M = '/opt/mirror/app/src/http/app.module.ts'

# ── 1. El import del módulo de dinero ────────────────────────────────────────
ANCLA_IMPORT = """import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { DomainError } from '../services/payment-auth.service';"""

NUEVO_IMPORT = """import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { DomainError } from '../services/payment-auth.service';
// El dinero del comercio, en un módulo puro (sin base de datos) para poder probarlo con números.
import { aConfigFee, computeOrderFees, type FeeConfig } from './orders-fees';"""

# ── 2. Asentar en la vía del botón de la tienda ──────────────────────────────
ANCLA_VIA1 = """      if (cfg.to === 'delivered') await this.sumarVentas(tx, orderId);
      // Cancelar o rechazar devuelve el stock"""

NUEVA_VIA1 = """      if (cfg.to === 'delivered') await this.sumarVentas(tx, orderId);
      // Y el dinero, en la MISMA transacción de la entrega: entregado y asentado, o ni una cosa ni otra.
      if (cfg.to === 'delivered') await this.asentarDinero(tx, o);
      // Cancelar o rechazar devuelve el stock"""

# ── 3. Asentar en la vía del código de contra entrega ────────────────────────
ANCLA_VIA2 = """      await this.sumarVentas(tx, orderId);
      await this.asentarDinero(tx, o);
    });"""

ANCLA_VIA2_REAL = """      await this.sumarVentas(tx, orderId);
    });
    await this.notify(o, userId, 'Pedido entregado y cobrado ✅');"""

NUEVA_VIA2 = """      await this.sumarVentas(tx, orderId);
      // El dinero también aquí: es la otra forma de entregar (código de contra entrega).
      await this.asentarDinero(tx, o);
    });
    await this.notify(o, userId, 'Pedido entregado y cobrado ✅');"""

# ── 4. Las comisiones en el detalle (para el vendedor) ───────────────────────
ANCLA_FEES_QUERY = """    // La reseña del pedido (si la hay): la escribe el comprador y la ven los dos."""

NUEVA_FEES_QUERY = """    // El desglose de dinero del pedido, si ya se entregó (se lo enseña al VENDEDOR, no al comprador).
    const comisiones: any[] = await db.$queryRaw`
      SELECT productos_xaf, entrega_xaf, total_xaf, comision_xaf, a_pagar_tienda_xaf, tope_aplicado, computed_at
        FROM lifebook.order_fees WHERE order_id = ${orderId}::uuid LIMIT 1`;
    const feeO = comisiones[0];

    // La reseña del pedido (si la hay): la escribe el comprador y la ven los dos."""

ANCLA_FEES_DETALLE = """        /** La valoración del pedido, si el comprador ya la escribió. */"""

NUEVA_FEES_DETALLE = """        /** Lo que deja este pedido: comisión de la plataforma y lo que se le paga a la tienda. */
        fees: esComprador
          ? undefined
          : feeO
            ? {
                productosXaf: Number(feeO.productos_xaf),
                entregaXaf: Number(feeO.entrega_xaf),
                totalXaf: Number(feeO.total_xaf),
                comisionXaf: Number(feeO.comision_xaf),
                aPagarXaf: Number(feeO.a_pagar_tienda_xaf),
                topeAplicado: !!feeO.tope_aplicado,
                computedAt: feeO.computed_at,
              }
            : null,
        /** La valoración del pedido, si el comprador ya la escribió. */"""

# ── 5. Los métodos del dinero ────────────────────────────────────────────────
ANCLA_METODOS = """  private async notify(o: any, autorId: string, texto: string) {"""

NUEVOS_METODOS = """  // ───────────────────────────── EL DINERO (punto 8) ───────────────────────

  /**
   * LA CONFIGURACIÓN DE COMISIÓN QUE MANDA PARA UNA TIENDA.
   *
   * Primero la suya (si tiene fila propia) y si no la general. Está en la base a propósito: el
   * porcentaje se cambia sin desplegar código, que es la regla que ya sigue Comida.
   */
  private async configDeComision(db: any, shopId: string | null): Promise<FeeConfig> {
    const filas: any[] = await db.$queryRaw`
      SELECT platform_percent, platform_min_xaf, max_total_percent
        FROM lifebook.commerce_fee_config
       WHERE (shop_id IS NOT NULL AND shop_id = ${shopId}::uuid) OR shop_id IS NULL
       ORDER BY (shop_id IS NOT NULL) DESC
       LIMIT 1`;
    return aConfigFee(filas[0]);
  }

  /**
   * ASENTAR EL DINERO DE UN PEDIDO ENTREGADO.
   *
   * Congela el desglose y escribe el asiento de doble partida. Va DENTRO de la transacción de la
   * entrega: un pedido entregado siempre tiene sus cuentas y uno no entregado nunca las tiene. Si ya
   * estaba asentado no se toca nada, así que un reintento no cuenta el dinero dos veces.
   */
  private async asentarDinero(tx: any, o: any) {
    const productos = Math.max(0, Number(o.subtotal_xaf ?? o.price_xaf ?? 0) - Number(o.discount_xaf ?? 0));
    const entrega = Math.max(0, Number(o.delivery_cost_xaf ?? 0));
    const cfg = await this.configDeComision(tx, o.shop_id ?? null);
    const f = computeOrderFees(productos, entrega, cfg);

    const filas: number = await tx.$executeRaw`
      INSERT INTO lifebook.order_fees
        (order_id, shop_id, productos_xaf, entrega_xaf, total_xaf, comision_xaf, a_pagar_tienda_xaf,
         tope_aplicado, platform_percent, platform_min_xaf)
      VALUES (${o.id}::uuid, ${o.shop_id}::uuid, ${f.productosXaf}, ${f.entregaXaf}, ${f.totalXaf},
              ${f.comisionXaf}, ${f.aPagarTiendaXaf}, ${f.topeAplicado},
              ${cfg.platformPercent}, ${cfg.platformMinXaf})
      ON CONFLICT (order_id) DO NOTHING`;
    if (!filas) return; // ya estaba asentado: ni una línea más en el libro

    const memo = 'pedido ' + String(o.order_no ?? '');
    await tx.$executeRaw`
      INSERT INTO lifebook.ledger_entries (order_id, cuenta, debe_xaf, haber_xaf, memo)
      VALUES (${o.id}::uuid, 'caja', ${f.totalXaf}, 0, ${memo})`;
    if (f.aPagarTiendaXaf > 0) {
      await tx.$executeRaw`
        INSERT INTO lifebook.ledger_entries (order_id, cuenta, debe_xaf, haber_xaf, memo)
        VALUES (${o.id}::uuid, 'a_pagar_tienda', 0, ${f.aPagarTiendaXaf}, ${memo})`;
    }
    if (f.comisionXaf > 0) {
      await tx.$executeRaw`
        INSERT INTO lifebook.ledger_entries (order_id, cuenta, debe_xaf, haber_xaf, memo)
        VALUES (${o.id}::uuid, 'comision_plataforma', 0, ${f.comisionXaf}, ${memo})`;
    }
    if (f.entregaXaf > 0) {
      await tx.$executeRaw`
        INSERT INTO lifebook.ledger_entries (order_id, cuenta, debe_xaf, haber_xaf, memo)
        VALUES (${o.id}::uuid, 'a_pagar_reparto', 0, ${f.entregaXaf}, ${memo})`;
    }
  }

  /** Las cuentas de una tienda: lo vendido, la comisión, lo pendiente y las liquidaciones hechas. */
  private async cuentasDeTienda(shopId: string) {
    const totales: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS pedidos,
             coalesce(sum(f.total_xaf), 0)::int AS facturado,
             coalesce(sum(f.comision_xaf), 0)::int AS comision,
             coalesce(sum(f.a_pagar_tienda_xaf), 0)::int AS a_pagar
        FROM lifebook.order_fees f WHERE f.shop_id = ${shopId}::uuid`;
    const ultima: any[] = await this.db.$queryRaw`
      SELECT max(hasta) AS hasta FROM lifebook.settlements WHERE shop_id = ${shopId}::uuid`;
    const desde = ultima[0]?.hasta ?? null;
    const pendiente: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS pedidos, coalesce(sum(f.a_pagar_tienda_xaf), 0)::int AS importe
        FROM lifebook.order_fees f
       WHERE f.shop_id = ${shopId}::uuid
         AND (${desde}::timestamptz IS NULL OR f.computed_at > ${desde}::timestamptz)`;
    const liq: any[] = await this.db.$queryRaw`
      SELECT id, desde, hasta, importe_xaf, pedidos, estado, pagado_at, nota
        FROM lifebook.settlements WHERE shop_id = ${shopId}::uuid ORDER BY pagado_at DESC LIMIT 20`;
    return {
      pedidos: Number(totales[0]?.pedidos ?? 0),
      facturadoXaf: Number(totales[0]?.facturado ?? 0),
      comisionXaf: Number(totales[0]?.comision ?? 0),
      aPagarTotalXaf: Number(totales[0]?.a_pagar ?? 0),
      pendienteXaf: Number(pendiente[0]?.importe ?? 0),
      pendientePedidos: Number(pendiente[0]?.pedidos ?? 0),
      liquidaciones: liq.map((l) => ({
        id: l.id, desde: l.desde, hasta: l.hasta, importeXaf: Number(l.importe_xaf),
        pedidos: Number(l.pedidos), estado: l.estado, pagadoAt: l.pagado_at, nota: l.nota,
      })),
    };
  }

  /**
   * LO QUE LA PLATAFORMA LE DEBE A MI TIENDA. Es la respuesta a «¿gano dinero dentro de la app?»: sin
   * esto, el vendedor cobra en mano y no sabe si le cuadra.
   */
  async saldoDeMiTienda(userId: string, shopIdFiltro?: string) {
    const mias: any[] = await this.db.$queryRaw`
      SELECT id, name FROM lifebook.shops WHERE owner_id = ${userId}::uuid ORDER BY name`;
    if (!mias.length) throw new DomainError('NOT_SHOP_OWNER', 'No tienes ninguna tienda');
    const tienda = shopIdFiltro ? mias.find((t) => t.id === shopIdFiltro) : mias[0];
    if (!tienda) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Esa tienda no es tuya');
    return {
      shop: { id: tienda.id, name: tienda.name },
      tiendas: mias.map((t) => ({ id: t.id, name: t.name })),
      ...(await this.cuentasDeTienda(tienda.id)),
    };
  }

  /**
   * LIQUIDAR A UNA TIENDA: se le paga a mano (al principio es lo que hay) y queda registrado cuánto,
   * por qué pedidos y quién lo hizo. Solo el admin: es el dinero de la plataforma.
   */
  async liquidarTienda(adminId: string, shopIdRaw: string, nota?: unknown) {
    if (!(await this.isAdmin(adminId))) {
      throw new DomainError('NOT_ADMIN', 'Solo el administrador puede liquidar a una tienda');
    }
    const shopId = this.uuid(shopIdRaw, 'Tienda');
    const cuentas = await this.cuentasDeTienda(shopId);
    if (cuentas.pendienteXaf <= 0) {
      throw new DomainError('NOTHING_TO_SETTLE', 'Esa tienda no tiene nada pendiente de cobrar');
    }
    const ultima: any[] = await this.db.$queryRaw`
      SELECT max(hasta) AS hasta FROM lifebook.settlements WHERE shop_id = ${shopId}::uuid`;
    const filas: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.settlements (shop_id, desde, hasta, importe_xaf, pedidos, nota, creado_por)
      VALUES (${shopId}::uuid, ${ultima[0]?.hasta ?? null}::timestamptz, now(), ${cuentas.pendienteXaf},
              ${cuentas.pendientePedidos}, ${String(nota ?? '').trim().slice(0, 300) || null}, ${adminId}::uuid)
      RETURNING id, shop_id, desde, hasta, importe_xaf, pedidos, estado, pagado_at, nota`;
    const l = filas[0];
    return {
      settlement: {
        id: l.id, shopId: l.shop_id, desde: l.desde, hasta: l.hasta, importeXaf: Number(l.importe_xaf),
        pedidos: Number(l.pedidos), estado: l.estado, pagadoAt: l.pagado_at, nota: l.nota,
      },
      cuentas: await this.cuentasDeTienda(shopId),
    };
  }

  /**
   * EL RESUMEN DE LA PLATAFORMA (solo el admin): cuánto se ha ganado de comisión, cuánto se debe a las
   * tiendas y —lo que de verdad avisa de un error— el **cuadre del libro**: si el debe y el haber no
   * coinciden, algo se asentó mal y hay que mirarlo antes de pagar a nadie.
   */
  async resumenDeLaPlataforma(adminId: string) {
    if (!(await this.isAdmin(adminId))) {
      throw new DomainError('NOT_ADMIN', 'Solo el administrador puede ver las cuentas de la plataforma');
    }
    const filas: any[] = await this.db.$queryRaw`
      SELECT s.id AS shop_id, s.name,
             count(f.order_id)::int AS pedidos,
             coalesce(sum(f.total_xaf), 0)::int AS facturado,
             coalesce(sum(f.comision_xaf), 0)::int AS comision,
             coalesce(sum(f.a_pagar_tienda_xaf), 0)::int AS a_pagar,
             coalesce((SELECT sum(l.importe_xaf) FROM lifebook.settlements l WHERE l.shop_id = s.id), 0)::int AS liquidado
        FROM lifebook.order_fees f
        JOIN lifebook.shops s ON s.id = f.shop_id
       GROUP BY s.id, s.name
       ORDER BY comision DESC`;
    const cuadre: any[] = await this.db.$queryRaw`
      SELECT coalesce(sum(debe_xaf), 0)::int AS debe, coalesce(sum(haber_xaf), 0)::int AS haber
        FROM lifebook.ledger_entries`;
    const debe = Number(cuadre[0]?.debe ?? 0);
    const haber = Number(cuadre[0]?.haber ?? 0);
    const tiendas = filas.map((r) => {
      const aPagar = Number(r.a_pagar ?? 0);
      const liquidado = Number(r.liquidado ?? 0);
      return {
        shopId: r.shop_id, nombre: r.name, pedidos: Number(r.pedidos ?? 0),
        facturadoXaf: Number(r.facturado ?? 0), comisionXaf: Number(r.comision ?? 0),
        aPagarXaf: aPagar, liquidadoXaf: liquidado, pendienteXaf: aPagar - liquidado,
      };
    });
    return {
      comisionTotalXaf: tiendas.reduce((n, t) => n + t.comisionXaf, 0),
      pendienteTotalXaf: tiendas.reduce((n, t) => n + t.pendienteXaf, 0),
      libro: { debeXaf: debe, haberXaf: haber, cuadra: debe === haber },
      tiendas,
    };
  }

  private async notify(o: any, autorId: string, texto: string) {"""

# ── 6. El controlador nuevo, en el módulo ────────────────────────────────────
ANCLA_MOD_IMPORT = """import { LifebookOrdersController } from '../lifebook/orders.controller';"""
NUEVO_MOD_IMPORT = """import { LifebookOrdersController } from '../lifebook/orders.controller';
import { LifebookOrdersMoneyController } from '../lifebook/orders-money.controller';"""

ANCLA_MOD_LISTA = """    LifebookOrdersController,"""
NUEVA_MOD_LISTA = """    LifebookOrdersController,
    LifebookOrdersMoneyController,"""


def aplicar(ruta, piezas, seco=False):
    src = open(ruta, encoding='utf-8').read()
    problemas = []
    for viejo, _ in piezas:
        n = src.count(viejo)
        if n != 1:
            problemas.append(f'{ruta}: esperaba 1 aparición y hay {n} → ' + viejo.strip().splitlines()[0][:60])
    if problemas:
        print('FALLO: los anclajes no cuadran. NO SE ESCRIBE NADA.')
        for p in problemas:
            print('  ·', p)
        return False
    if seco:
        return True
    shutil.copyfile(ruta, f'{ruta}.bak-{SELLO}')
    print(f'respaldo: {ruta}.bak-{SELLO}')
    for viejo, nuevo in piezas:
        src = src.replace(viejo, nuevo)
    open(ruta, 'w', encoding='utf-8', newline='').write(src)
    return True


def main():
    if 'asentarDinero' in open(P, encoding='utf-8').read():
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    piezasP = [
        (ANCLA_IMPORT, NUEVO_IMPORT),
        (ANCLA_VIA1, NUEVA_VIA1),
        (ANCLA_VIA2_REAL, NUEVA_VIA2),
        (ANCLA_FEES_QUERY, NUEVA_FEES_QUERY),
        (ANCLA_FEES_DETALLE, NUEVA_FEES_DETALLE),
        (ANCLA_METODOS, NUEVOS_METODOS),
    ]
    # Primero se comprueban TODOS los anclajes (de los dos ficheros) sin escribir nada.
    if not aplicar(P, piezasP, seco=True):
        return 1
    if not aplicar(M, [(ANCLA_MOD_IMPORT, NUEVO_MOD_IMPORT), (ANCLA_MOD_LISTA, NUEVA_MOD_LISTA)], seco=True):
        return 1
    if not aplicar(P, piezasP):
        return 1
    if not aplicar(M, [(ANCLA_MOD_IMPORT, NUEVO_MOD_IMPORT), (ANCLA_MOD_LISTA, NUEVA_MOD_LISTA)]):
        print('OJO: el servicio SÍ se escribió y el módulo NO. La ruta nueva no existiría: revisar a mano.')
        return 1
    print('escrito orders.service.ts (asentarDinero + saldos + liquidación + resumen) y app.module.ts (controlador de dinero)')
    return 0


sys.exit(main())
