/**
 * Fase 0 · 0.6 — El carrito de Life Book cobra de verdad con el monedero (D-36).
 *
 * Qué pasaba: el carrito ofrecía «Monedero» entre las formas de pago y creaba el pedido SIN el
 * token de pago que el servidor exige para cobrar del monedero (`api/commerce.ts:658`). El
 * comprador elegía monedero y el pedido no se podía cobrar.
 *
 * Qué se hace: se pide el PIN y se obtiene un token POR TIENDA (el token va atado al importe exacto
 * de esa tienda), se pasa a `create()` como tercer argumento, y se olvidan los tokens al terminar
 * —son de un solo uso—. Si el envío está «a consultar» no hay importe que firmar: se dice claro y
 * se ofrecen las alternativas, en vez de ofrecer un pago que no puede completarse.
 *
 * Uso: node pruebas/fase0-carrito-con-monedero.cjs
 */
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..');
const REL = 'app/lifebook-carrito-checkout.tsx';
const p = path.join(APP, REL);
let fallos = 0;

function rep(from, to, label) {
  const t = fs.readFileSync(p, 'utf8');
  if (!t.includes(from)) { console.log(`  SIN ANCLA: ${label}`); fallos++; return; }
  fs.writeFileSync(p, t.split(from).join(to), 'utf8');
  console.log(`  OK ${label}`);
}

// 1) imports
rep(
  "import { alpha, useTheme } from '@egrouteplan/ui-kit';",
  "import { alpha, useTheme, PinSheet } from '@egrouteplan/ui-kit';",
  'import del PinSheet (del kit)');
rep(
  "import { commerceOrdersApi, cuponesApi, descuentoDeCupon, type LbCupon } from '../api/commerce';",
  "import { commerceOrdersApi, cuponesApi, descuentoDeCupon, type LbCupon } from '../api/commerce';\nimport { walletApi } from '../api/wallet';",
  'import de walletApi');

// 2) estados + total por tienda + `pagar` que acepta los tokens
rep(
  '  const pagar = useCallback(async () => {',
  `  /**
   * PAGO CON MONEDERO EN EL CARRITO (Fase 0 de la auditoría de diseño, D-36).
   *
   * El token de pago va atado a un importe EXACTO, así que solo se pide cuando el total de esa
   * tienda se conoce de verdad. Si el envío queda «a consultar», no hay importe que firmar.
   */
  const [pinTienda, setPinTienda] = useState<{ clave: string; nombre: string; total: number } | null>(null);
  const [tokensPago, setTokensPago] = useState<Record<string, string>>({});
  const [pinErr, setPinErr] = useState<string | null>(null);

  /** Total exacto de una tienda, o null si todavía no se sabe (envío a consultar). */
  const totalDeTienda = useCallback((g: LbGrupoCarrito): number | null => {
    const clave = g.shop?.id ?? 'sin-tienda';
    const envio = envioDe(g, entrega[clave] ?? 'pickup');
    if (envio === null) return null;
    return Math.max(0, g.subtotalXaf + envio - descuentoDeCupon(cuponDe(g), g.subtotalXaf));
  }, [envioDe, entrega, cuponDe]);

  const pagar = useCallback(async (tokens: Record<string, string> = tokensPago) => {`,
  'estados del pago con monedero');

// 3) antes de enviar: si hay monedero sin token, pedir el PIN de esa tienda
rep(
  '    setEnviando(true);\n    setError(null);',
  `    // Monedero: cada tienda que se pague con monedero necesita su token (importe exacto + PIN).
    const conMonedero = bloques.filter(
      (g) => pago[g.shop?.id ?? 'sin-tienda'] === 'likebook_wallet' && !tokens[g.shop?.id ?? 'sin-tienda'],
    );
    if (conMonedero.length) {
      const g0 = conMonedero[0];
      const clave0 = g0.shop?.id ?? 'sin-tienda';
      const total0 = totalDeTienda(g0);
      if (total0 === null) {
        setError(\`En el pedido de \${g0.shop?.name ?? 'esa tienda'} el envío se acuerda al confirmar: elige efectivo, o paga con monedero desde la ficha del producto.\`);
        return;
      }
      setPinErr(null);
      setPinTienda({ clave: clave0, nombre: g0.shop?.name ?? 'la tienda', total: total0 });
      return;
    }
    setEnviando(true);
    setError(null);`,
  'pedir el PIN antes de crear el pedido');

// 4) el token viaja al servidor
rep('        }, claves[clave]);', '        }, claves[clave], tokens[clave]);', 'el token se envía a create()');

// 5) los tokens son de un solo uso: se olvidan al terminar
rep('      setExito({ ids: hechos, codigos });',
  `      setExito({ ids: hechos, codigos });
      // Los tokens de pago son de UN SOLO USO: si se quedaran, el siguiente pedido fallaría.
      setTokensPago({});`,
  'olvidar los tokens usados');

// 6) deps + el manejador del PIN
rep(
  '  }, [enviando, bloques, entrega, pago, nota, ciudad, zona, referencia, claves, cuponPorTienda]);',
  `  }, [enviando, bloques, entrega, pago, nota, ciudad, zona, referencia, claves, cuponPorTienda, tokensPago, totalDeTienda]);

  /** El PIN del monedero: se obtiene el token de ESA tienda y se sigue con el pedido. */
  const confirmarPin = useCallback(async (pin: string) => {
    if (!pinTienda) return;
    try {
      const token = await walletApi.paymentToken(pin, 'ESCROW_LOCK', pinTienda.total);
      const siguiente = { ...tokensPago, [pinTienda.clave]: token };
      setTokensPago(siguiente);
      setPinTienda(null);
      // Se sigue con el mapa ya completo: si queda otra tienda con monedero, se pedirá el suyo.
      void pagar(siguiente);
    } catch (e) {
      setPinErr(e instanceof Error ? e.message : 'No se pudo confirmar el PIN');
    }
  }, [pinTienda, tokensPago, pagar]);`,
  'manejador del PIN y dependencias');

// 7) la hoja del PIN
rep(
  '    </View>\n  );\n}\n\nconst styles = StyleSheet.create({',
  `      <PinSheet
        visible={!!pinTienda}
        title={pinTienda ? \`Pagar \${lbXaf(pinTienda.total)} en \${pinTienda.nombre}\` : 'Confirmar el pago'}
        subtitle="El importe queda en garantía hasta que recibas el pedido."
        busy={false}
        error={pinErr}
        confirmLabel="Confirmar pago"
        onClose={() => { setPinTienda(null); setPinErr(null); }}
        onConfirm={(pin) => void confirmarPin(pin)}
      />
    </View>
  );
}

const styles = StyleSheet.create({`,
  'hoja del PIN dentro de la caja');

console.log(fallos ? `\n${fallos} anclaje(s) fallidos` : '\nTodos los cambios aplicados');
process.exit(fallos ? 1 : 0);
