// =============================================================================
// payments.service.ts — LA PIEZA PARA ENCHUFAR UN COBRO DE VERDAD (punto 9 de la §3)
//
// ── QUÉ ES Y QUÉ NO ES ──────────────────────────────────────────────────────────
// Es **la pieza**, no el proveedor. Hoy el comercio **registra** la forma de pago y el dinero se mueve
// fuera (efectivo, transferencia, depósito): no hay ninguna pasarela, y este fichero **no la inventa**.
// Lo que hace es dejar el hueco hecho —con su forma y sus reglas— para que el día que el dueño firme con
// Maviance, Notch Pay o el QR CEMAC, enchufarlo sea escribir UN fichero que cumpla esta interfaz y
// registrarlo en una línea, sin tocar el comercio (ni el carrito, ni el pedido, ni el libro de cuentas).
//
// ── LAS CUATRO REGLAS ───────────────────────────────────────────────────────────
//  1. **El importe lo decide el servidor**, nunca la app ni el proveedor: quien cobra recibe el importe
//     que ya está en el pedido (`total_xaf`). Un proveedor no puede «sugerir» otro.
//  2. **El estado del pago lo manda el proveedor, y se comprueba**: un aviso (webhook) solo vale si el
//     proveedor lo firma o si, al preguntarle, confirma que ese cobro está pagado. Un webhook suelto no
//     puede marcar un pedido como cobrado — eso sería regalar mercancía.
//  3. **Idempotencia**: el mismo cobro no se marca dos veces (y el mismo aviso tampoco).
//  4. **Sin proveedor conectado, el camino de siempre**: `manual` (la tienda cobra por fuera y lo marca
//     con su justificante, que ya existe: `POST /orders/:id/mark-paid`).
//
// ── LO QUE HAY QUE ESCRIBIR PARA CONECTAR UNO DE VERDAD ─────────────────────────
// Un objeto que cumpla `PaymentProvider` y registrarlo en `PROVEEDORES`. Nada más: el pedido, el libro
// de cuentas, la comisión y los avisos ya funcionan igual.
// =============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../services/payment-auth.service';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';

/** Lo que se le pide a un proveedor para cobrar un pedido. El importe lo pone el SERVIDOR. */
export interface CargoSolicitado {
  orderId: string;
  /** El código del pedido (`LB-…`), que es lo que ve el comprador y lo que se le puede enseñar. */
  orderNo: string;
  /** Importe exacto en XAF, tal como está en el pedido. */
  amountXaf: number;
  currency: string;
  /** Teléfono del comprador, si el proveedor lo necesita (los agregadores locales lo piden). */
  buyerPhone?: string | null;
  description?: string | null;
}

/** Lo que devuelve el proveedor al abrir un cobro. */
export interface CargoAbierto {
  /** Identificador del cobro EN EL PROVEEDOR. Es lo que se guarda para poder preguntar por él. */
  providerRef: string;
  status: EstadoDeCobro;
  /** Para pagar desde el móvil: el enlace de pago o el contenido del QR (lo que dé el proveedor). */
  payUrl?: string | null;
  qrPayload?: string | null;
  /** Cuándo caduca el cobro, si el proveedor lo dice. */
  expiresAt?: string | null;
}

export type EstadoDeCobro = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';

export interface CargoConsultado {
  status: EstadoDeCobro;
  /** Cuándo se cobró, si está pagado (es lo que va a `paid_at`). */
  paidAt?: string | null;
  /** Lo que dijo el proveedor, para poder auditar sin volver a llamarle. */
  raw?: unknown;
}

export interface Reembolso {
  status: 'refunded' | 'pending' | 'failed';
  refundRef?: string | null;
}

/**
 * LA INTERFAZ. Un proveedor de verdad implementa esto y se registra; nada más del comercio cambia.
 * `capabilities` es lo que la app y el panel necesitan para saber qué se puede ofrecer.
 */
export interface PaymentProvider {
  /** Identificador corto y estable: 'manual', 'maviance', 'notchpay'… */
  readonly id: string;
  /** Nombre para enseñar en el panel. */
  readonly name: string;
  readonly capabilities: {
    /** ¿Da un QR para pagar desde el móvil? */
    qr: boolean;
    /** ¿Avisa por webhook cuando alguien paga? */
    webhook: boolean;
    /** ¿Se puede devolver el dinero desde aquí? */
    refunds: boolean;
  };
  /** Abre un cobro. Si el proveedor no puede, se lanza `DomainError` con el motivo. */
  createCharge(cargo: CargoSolicitado): Promise<CargoAbierto>;
  /** Pregunta por un cobro: es la comprobación de verdad, la que no se puede saltar. */
  getCharge(providerRef: string): Promise<CargoConsultado>;
  /**
   * ¿Este aviso (webhook) viene de verdad del proveedor? Si el proveedor no firma, esta función tiene
   * que **preguntarle** y confirmar el estado antes de dejarlo pasar. Devuelve null si no es válido.
   */
  verifyWebhook?(headers: Record<string, string>, body: unknown): Promise<{ providerRef: string; status: EstadoDeCobro } | null>;
  /** Devolver dinero, si el proveedor lo permite. */
  refund?(providerRef: string, amountXaf: number): Promise<Reembolso>;
}

/**
 * EL PROVEEDOR `manual`: el camino que YA existe.
 *
 * No cobra nada: es la forma de pago que se cierra por fuera (efectivo, transferencia, depósito) y que
 * la tienda marca con su justificante (`POST /orders/:id/mark-paid`). Está aquí para que el
 * comportamiento de hoy tenga el mismo nombre y el mismo hueco que tendrá el de mañana.
 */
export const PROVEEDOR_MANUAL: PaymentProvider = {
  id: 'manual',
  name: 'Cobro por fuera (la tienda marca cobrado)',
  capabilities: { qr: false, webhook: false, refunds: false },
  async createCharge(cargo) {
    // No hay pasarela: el cobro queda «pendiente» y lo cierra la tienda con su justificante.
    return { providerRef: `manual:${cargo.orderNo}`, status: 'pending', payUrl: null, qrPayload: null, expiresAt: null };
  },
  async getCharge(providerRef) {
    // Sin pasarela no hay nada que preguntar: sigue pendiente hasta que la tienda lo cierre.
    return { status: 'pending', raw: { providerRef, nota: 'cobro manual: lo cierra la tienda con el justificante' } };
  },
};

@Injectable()
export class LifebookPaymentsService {
  private readonly log = new Logger('LifebookPayments');
  /** El registro. Hoy solo el camino manual; cada proveedor real que se firme se añade aquí. */
  private readonly proveedores: PaymentProvider[] = [PROVEEDOR_MANUAL];

  constructor(private readonly db: MobilityPrismaService) {}

  /** Qué se puede cobrar hoy, y con qué capacidades. Es lo que enseña el panel. */
  listar() {
    return {
      providers: this.proveedores.map((p) => ({ id: p.id, name: p.name, capabilities: p.capabilities })),
      /** Dicho claro, para que nadie se confunda al leer el panel. */
      aviso: 'Solo está conectado el cobro manual: el dinero se mueve fuera de la app y la tienda lo marca con su justificante. No hay ninguna pasarela conectada.',
    };
  }

  private buscar(id: string): PaymentProvider {
    const p = this.proveedores.find((x) => x.id === String(id ?? '').trim().toLowerCase());
    if (!p) throw new DomainError('PAYMENT_PROVIDER_UNKNOWN', 'Ese proveedor de cobro no está conectado');
    return p;
  }

  /**
   * ABRIR UN COBRO DEL PEDIDO. El importe sale del PEDIDO, no de quien llama: es la regla que evita que
   * un proveedor (o la app) cobre una cifra distinta de la que se compró.
   */
  async abrirCobro(userId: string, orderIdRaw: string, providerId: string) {
    const orderId = String(orderIdRaw ?? '').trim();
    const filas: any[] = await this.db.$queryRaw`
      SELECT o.id, o.order_no, o.total_xaf, o.buyer_id, o.status, o.payment_status
        FROM lifebook.orders o WHERE o.id = ${orderId}::uuid LIMIT 1`;
    const o = filas[0];
    if (!o) throw new DomainError('ORDER_NOT_FOUND', 'El pedido no existe');
    if (o.buyer_id !== userId) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Ese pedido no es tuyo');
    if (o.payment_status === 'paid') throw new DomainError('PAYMENT_ALREADY_PAID', 'Ese pedido ya está cobrado');

    const p = this.buscar(providerId);
    const cargo = await p.createCharge({
      orderId: o.id,
      orderNo: String(o.order_no),
      amountXaf: Number(o.total_xaf ?? 0),
      // El comercio es XAF y está en todas partes (`total_xaf`, `lbXaf`): `orders` no tiene columna de
      // moneda, y pedirla reventaba la consulta (HTTP 500 en todos los cobros). No se inventa.
      currency: 'XAF',
      description: `Pedido ${o.order_no}`,
    });
    return { provider: p.id, orderId: o.id, amountXaf: Number(o.total_xaf ?? 0), charge: cargo };
  }

  /**
   * EL AVISO DEL PROVEEDOR (webhook). No marca nada por sí solo: primero el proveedor tiene que
   * CONFIRMAR que ese cobro está pagado (`verifyWebhook` o `getCharge`). Un aviso suelto no puede dar un
   * pedido por cobrado.
   */
  async avisoDePago(providerId: string, headers: Record<string, string>, body: unknown) {
    const p = this.buscar(providerId);
    if (!p.capabilities.webhook || !p.verifyWebhook) {
      throw new DomainError('PAYMENT_NO_WEBHOOK', `El proveedor «${p.id}» no avisa por webhook`);
    }
    const aviso = await p.verifyWebhook(headers ?? {}, body);
    if (!aviso) throw new DomainError('PAYMENT_WEBHOOK_INVALID', 'Ese aviso no se puede verificar: no se toca el pedido');
    // Y se confirma con el proveedor, que es quien manda sobre el estado del cobro.
    const confirmado = await p.getCharge(aviso.providerRef);
    this.log.log(`aviso de ${p.id} para ${aviso.providerRef}: dice ${aviso.status}, el proveedor dice ${confirmado.status}`);
    return { provider: p.id, providerRef: aviso.providerRef, status: confirmado.status, aplicado: false,
      nota: 'confirmado con el proveedor; el cobro lo aplica el mismo camino que el cobro manual (con su justificante)' };
  }
}
