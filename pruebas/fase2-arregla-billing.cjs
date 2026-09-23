/**
 * Repara la adopción de Sheet/Aviso en billing-status: el bloque se insertó dos veces (mi script
 * reemplazaba todas las coincidencias) y faltaban imports.
 * Uso: node pruebas/fase2-arregla-billing.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/billing-status.tsx');
let t = fs.readFileSync(p, 'utf8');

const BLOQUE = `      {/* Confirmación en HOJA (antes: modal del sistema) */}
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
`;

// 1) quitar TODAS las copias del bloque
const veces = t.split(BLOQUE).length - 1;
t = t.split(BLOQUE).join('');
console.log(`  copias del bloque eliminadas: ${veces}`);

// 2) imports que faltaban
if (!t.includes('GhostButton')) {
  t = t.replace(
    "import { useTheme, alpha, PrimaryButton } from '@egrouteplan/ui-kit';",
    "import { useTheme, alpha, PrimaryButton, GhostButton, Sheet, Aviso } from '@egrouteplan/ui-kit';",
  );
  console.log('  OK imports de GhostButton, Sheet y Aviso');
}

// 3) insertar UNA vez antes del cierre del componente principal (el último `  );` + `}` del archivo)
const cierre = '\n  );\n}';
const i = t.lastIndexOf(cierre);
if (i < 0) { console.log('  SIN ANCLA: cierre del componente'); process.exit(1); }
t = t.slice(0, i) + '\n' + BLOQUE + t.slice(i);
console.log('  OK bloque insertado una sola vez al final del componente');

fs.writeFileSync(p, t, 'utf8');
