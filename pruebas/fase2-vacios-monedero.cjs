/**
 * Fase 2 · 23 — Difusión de `EmptyState` (D-17), tanda 1: las tres pantallas del MONEDERO.
 *
 * El criterio del informe es «título + por qué está vacío + qué hacer ahora», y el informe dice
 * empezar por los flujos de dinero. Los cuatro vacíos del monedero hechos con el componente del kit
 * eran: movimientos (ya estaba), Mis tickets, pedidos del mercado e historial de viajes. Faltaban
 * los tres de dentro del monedero:
 *
 *   1. `monedero.tsx`         «Todavía no hay movimientos.» (una línea suelta, sin salida)
 *   2. `monedero-recargar.tsx` «No hay agentes activos ahora mismo.»
 *   3. `monedero-retirar.tsx`  «No hay agentes activos ahora mismo.»
 *
 * Los dos últimos son los importantes: **sin agente de efectivo el usuario no puede ni entregar ni
 * recoger su dinero**, así que un texto que solo informa es un callejón. La salida existe y ya está
 * construida: `constants/soporte.ts` (Fase 0, D-37) con `whatsappSoporte()`. Se usa igual que en
 * `billing-status`, `kyc/status` y `settings`: `void whatsappSoporte('…')` dentro de `onPress`.
 *
 * Uso: node pruebas/fase2-vacios-monedero.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

const casos = [
  // ── 1) El monedero: la lista corta de últimos movimientos ──────────────────
  {
    archivo: 'app/monedero.tsx',
    importViejo: "import { useTheme, Tactil } from '@egrouteplan/ui-kit';",
    importNuevo: "import { EmptyState, useTheme, Tactil } from '@egrouteplan/ui-kit';",
    importExtra: null,
    viejo: [
      '            {txs.length === 0 ? (',
      '              <Text style={{ color: colors.textSecondary, fontSize: 13.5, textAlign: \'center\', paddingVertical: 18 }}>',
      '                Todavía no hay movimientos.',
      '              </Text>',
      '            ) : txs.map((t) => {',
    ].join('\n'),
    nuevo: [
      '            {txs.length === 0 ? (',
      '              /* Vacío con salida (D-17): qué es, por qué está vacío y qué hacer ahora. */',
      '              <EmptyState',
      '                compacto',
      '                titulo="Todavía no hay movimientos"',
      '                texto="Aquí se apunta cada recarga, retirada y pago que hagas con el monedero."',
      '                accionLabel="Recargar con un agente"',
      "                onAccion={() => router.push('/monedero-recargar' as never)}",
      '              />',
      '            ) : txs.map((t) => {',
    ].join('\n'),
  },

  // ── 2) Recargar: sin agente no hay forma de entregar el efectivo ───────────
  {
    archivo: 'app/monedero-recargar.tsx',
    importViejo: "import { PrimaryButton, useTheme, Tactil } from '@egrouteplan/ui-kit';",
    importNuevo: "import { EmptyState, PrimaryButton, useTheme, Tactil } from '@egrouteplan/ui-kit';",
    importExtra: "import { whatsappSoporte } from '../constants/soporte';",
    viejo: [
      '          ) : agents.length === 0 ? (',
      '            <Text style={{ color: colors.textSecondary, fontSize: 13.5, marginTop: 8 }}>',
      '              No hay agentes activos ahora mismo.',
      '            </Text>',
      '          ) : agents.map((a) => (',
    ].join('\n'),
    nuevo: [
      '          ) : agents.length === 0 ? (',
      '            /*',
      '              Sin agente de efectivo no hay forma de ENTREGAR el dinero: un texto que solo informa',
      '              deja al usuario bloqueado en una pantalla de dinero. La salida real es soporte.',
      '            */',
      '            <EmptyState',
      '              compacto',
      '              titulo="No hay ningún agente de efectivo disponible"',
      '              texto="Los agentes aparecen aquí en cuanto se conectan. Sin agente no se puede entregar tu efectivo."',
      '              accionLabel="Escribir a soporte"',
      "              onAccion={() => { void whatsappSoporte('Hola, quiero recargar el monedero y no veo agentes de efectivo disponibles.'); }}",
      '            />',
      '          ) : agents.map((a) => (',
    ].join('\n'),
  },

  // ── 3) Retirar: igual, pero al revés (recoger el efectivo) ─────────────────
  {
    archivo: 'app/monedero-retirar.tsx',
    importViejo: "import { PrimaryButton, useTheme, Tactil } from '@egrouteplan/ui-kit';",
    importNuevo: "import { EmptyState, PrimaryButton, useTheme, Tactil } from '@egrouteplan/ui-kit';",
    importExtra: "import { whatsappSoporte } from '../constants/soporte';",
    viejo: [
      '          ) : agents.length === 0 ? (',
      '            <Text style={{ color: colors.textSecondary, fontSize: 13.5, marginTop: 8 }}>',
      '              No hay agentes activos ahora mismo.',
      '            </Text>',
      '          ) : agents.map((a) => (',
    ].join('\n'),
    nuevo: [
      '          ) : agents.length === 0 ? (',
      '            /*',
      '              Sin agente de efectivo no hay forma de RECOGER el dinero: un texto que solo informa',
      '              deja al usuario bloqueado en una pantalla de dinero. La salida real es soporte.',
      '            */',
      '            <EmptyState',
      '              compacto',
      '              titulo="No hay ningún agente de efectivo disponible"',
      '              texto="Los agentes aparecen aquí en cuanto se conectan. Sin agente no se puede recoger tu efectivo."',
      '              accionLabel="Escribir a soporte"',
      "              onAccion={() => { void whatsappSoporte('Hola, quiero retirar del monedero y no veo agentes de efectivo disponibles.'); }}",
      '            />',
      '          ) : agents.map((a) => (',
    ].join('\n'),
  },
];

for (const c of casos) {
  const p = path.join(APP, c.archivo);
  let t = fs.readFileSync(p, 'utf8');
  if (!t.includes(c.viejo)) { console.log(`  SIN ANCLA: vacío en ${c.archivo}`); fallos++; continue; }
  if (!t.includes(c.importViejo)) { console.log(`  SIN ANCLA: import en ${c.archivo}`); fallos++; continue; }

  t = t.replace(c.viejo, c.nuevo);
  t = t.replace(c.importViejo, c.importNuevo);
  if (c.importExtra && !t.includes(c.importExtra)) {
    t = t.replace(c.importNuevo, c.importNuevo + '\n' + c.importExtra);
  }
  fs.writeFileSync(p, t, 'utf8');
  console.log(`  OK ${c.archivo}`);
}

console.log(fallos ? `\n${fallos} problema(s): revisar a mano` : '\nVacíos del monedero con salida');
process.exit(fallos ? 1 : 0);
