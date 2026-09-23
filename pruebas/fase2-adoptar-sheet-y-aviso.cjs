/**
 * Fase 2 · Adopción de `Sheet` y `Aviso` en la pantalla de facturación (D-03/D-19/D-20).
 *
 * Se sustituyen dos `Alert` de una pantalla de DINERO:
 *   · La confirmación de cancelar una orden → `Sheet` (el usuario decide sin perder la pantalla).
 *   · El aviso posterior a cancelar → `Aviso` (información, no interrupción).
 *
 * Uso: node pruebas/fase2-adoptar-sheet-y-aviso.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

function rep(rel, from, to, label) {
  const p = path.join(APP, rel);
  const t = fs.readFileSync(p, 'utf8');
  if (!t.includes(from)) { console.log(`  SIN ANCLA: ${label}`); fallos++; return; }
  fs.writeFileSync(p, t.split(from).join(to), 'utf8');
  console.log(`  OK ${label}`);
}

const B = 'app/billing-status.tsx';

// 1 · estado nuevo (orden pendiente de confirmar + aviso)
rep(B,
  '  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);',
  `  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  /**
   * Confirmación con HOJA, no con modal del sistema (auditoría de diseño, D-03/D-20): el usuario ve
   * el importe y el contexto mientras decide, y el botón de atrás no le deja a medias.
   */
  const [ordenACancelar, setOrdenACancelar] = useState<string | null>(null);
  /** Aviso que aparece y se va: para informar, no para interrumpir. */
  const [aviso, setAviso] = useState<string | null>(null);`,
  'estado de la hoja de confirmación y del aviso');

// 2 · el Alert de confirmación → hoja
rep(B,
  `    Alert.alert('Cancelar orden', \`Se cancelará esta orden pendiente de pago. Si ya hiciste una transferencia, escríbenos para el reembolso: \${SOPORTE.email} · WhatsApp \${SOPORTE.telefono}\`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar', style: 'destructive',
        onPress: async () => {
          setCancellingOrderId(orderId);
          try {
            await billingApi.cancelOrder(orderId, 'Cancelada por el usuario');
            Alert.alert('Orden cancelada', \`Tu orden fue cancelada. Si ya pagaste, escríbenos para el reembolso: \${SOPORTE.email} · WhatsApp \${SOPORTE.telefono}\`, [
              { text: 'Cerrar', style: 'cancel' },
              { text: 'Pedir el reembolso', onPress: () => { void whatsappSoporte('Hola, cancelé una orden y ya había pagado. Quiero el reembolso.'); } },
            ]);
            await load('refresh');
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cancelar la orden');`,
  `    // Abre la hoja: la confirmación se hace en pantalla, no en un modal del sistema.
    setOrdenACancelar(orderId);
  };

  /** Cancela de verdad, ya confirmado en la hoja. */
  const cancelarDeVerdad = async (orderId: string) => {
    setOrdenACancelar(null);
    {
      {
        setCancellingOrderId(orderId);
        try {
          await billingApi.cancelOrder(orderId, 'Cancelada por el usuario');
          setAviso('Orden cancelada. Si ya pagaste, pide el reembolso con el botón de abajo.');
          await load('refresh');
        } catch (e) {
          Alert.alert('Error', e instanceof Error ? mensajeDeError(e, 'No se pudo cancelar la orden') : 'No se pudo cancelar la orden');`,
  'el Alert de confirmación pasa a ser una hoja');

// 3 · la hoja y el aviso, dentro del render
rep(B,
  '    </View>\n  );\n}',
  `      {/* Confirmación en HOJA (antes: modal del sistema) */}
      <Sheet
        visible={!!ordenACancelar}
        title="¿Cancelar esta orden?"
        subtitle="Se cancelará la orden pendiente de pago. Si ya hiciste una transferencia, escríbenos para el reembolso."
        busy={!!cancellingOrderId}
        onClose={() => setOrdenACancelar(null)}
      >
        <PrimaryButton
          title="Sí, cancelar"
          variant="danger"
          onPress={() => { if (ordenACancelar) void cancelarDeVerdad(ordenACancelar); }}
        />
        <GhostButton title="No, dejarla como está" onPress={() => setOrdenACancelar(null)} />
      </Sheet>

      {/* Aviso que aparece y se va */}
      <Aviso
        visible={!!aviso}
        mensaje={aviso ?? ''}
        tono="exito"
        onOcultar={() => setAviso(null)}
      />

      {/* Reembolso: cuando se ha cancelado algo, el camino para pedirlo está a la vista */}
      {aviso ? (
        <View style={{ position: 'absolute', left: 24, right: 24, bottom: 104 }}>
          <GhostButton
            title="Pedir el reembolso por WhatsApp"
            onPress={() => { void whatsappSoporte('Hola, cancelé una orden y ya había pagado. Quiero el reembolso.'); }}
          />
        </View>
      ) : null}
    </View>
  );
}`,
  'la hoja y el aviso en el render');

// 4 · imports
rep(B,
  "import { SOPORTE, whatsappSoporte } from '../constants/soporte';",
  `import { SOPORTE, whatsappSoporte } from '../constants/soporte';
import { mensajeDeError } from '../constants/errores';`,
  'import del mapa de errores');

console.log(fallos ? `\n${fallos} problema(s)` : '\nAdopción de Sheet y Aviso aplicada');
process.exit(fallos ? 1 : 0);
