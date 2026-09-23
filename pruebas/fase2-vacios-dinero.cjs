/**
 * Fase 2 · 23 — Difusión de `EmptyState` (D-17), tanda 2: facturación y agente de efectivo.
 *
 * Sigue el criterio del informe (título + por qué está vacío + qué hacer ahora) en cuatro vacíos
 * escritos a mano:
 *
 *   `billing-status.tsx`  «Sin derechos activos» (ya tenía título y explicación, pero con el
 *                          tipografiado a mano: 14 y **12**, y el 12 rompe el suelo de 13 px que la
 *                          Fase 1 fijó para las pantallas de dinero) → al kit, conservando
 *                          `ModulePlans` debajo (el kit no tiene hueco para hijos sueltos).
 *   `billing-status.tsx`  «Aún no has realizado compras.» (una línea sin título ni salida) → kit.
 *   `agente.tsx`          «Nada por confirmar.» → kit.
 *   `agente.tsx`          «No tienes recados en curso.» → kit.
 *
 * REGLA QUE SE APLICA AQUÍ Y CONVIENE NO OLVIDAR: cuando el vacío es una **espera** (el agente no
 * puede provocar una operación de efectivo, solo confirmarla cuando el cliente enseña el código),
 * la «acción» es **saber qué lo llena**. Inventar un botón para cumplir la plantilla sería relleno.
 *
 * Uso: node pruebas/fase2-vacios-dinero.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

const casos = [
  // ── billing-status: derechos activos ───────────────────────────────────────
  {
    archivo: 'app/billing-status.tsx',
    viejo: [
      '          {activeEnt.length === 0 ? (',
      '            <View style={{ alignItems: \'center\', paddingVertical: 24 }}>',
      '              <Package size={40} color={colors.border} />',
      '              <Text style={{ fontSize: 14, fontWeight: \'800\', color: colors.textPrimary, marginTop: 10 }}>Sin derechos activos</Text>',
      '              <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: \'center\', marginTop: 4, lineHeight: 17 }}>',
      '                Compra un plan para activar tus derechos (publicar, destacar, tienda…).',
      '              </Text>',
      '              <ModulePlans />',
      '            </View>',
      '          ) : (',
    ].join('\n'),
    nuevo: [
      '          {activeEnt.length === 0 ? (',
      '            /*',
      '              Vacío con salida (D-17) con el componente del kit. `ModulePlans` se queda DEBAJO',
      '              y fuera: el kit no tiene hueco para hijos sueltos, así que una acción con varias',
      '              opciones vive fuera. De paso, los textos pasan del 14/12 escritos a mano al 15/13,5',
      '              del kit — ese 12 rompía el suelo de 13 px de las pantallas de dinero (Fase 1).',
      '            */',
      '            <>',
      '              <EmptyState',
      '                icono={<Package size={40} color={colors.textSecondary} />}',
      '                titulo="Sin derechos activos"',
      '                texto="Compra un plan para activar tus derechos (publicar, destacar, tienda…)."',
      '              />',
      '              <ModulePlans />',
      '            </>',
      '          ) : (',
    ].join('\n'),
  },

  // ── billing-status: órdenes ────────────────────────────────────────────────
  {
    archivo: 'app/billing-status.tsx',
    viejo: [
      '          {orders.length === 0 ? (',
      '            <View style={{ alignItems: \'center\', paddingVertical: 16 }}>',
      '              <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: \'center\', marginVertical: 4 }}>',
      '                Aún no has realizado compras.',
      '              </Text>',
      '            </View>',
      '          ) : (',
    ].join('\n'),
    nuevo: [
      '          {orders.length === 0 ? (',
      '            <EmptyState',
      '              compacto',
      '              icono={<Receipt size={26} color={colors.textSecondary} />}',
      '              titulo="Todavía no has comprado nada"',
      '              texto="Aquí aparecerá cada compra de plan, con su estado y su reembolso si lo hubiera."',
      '            />',
      '          ) : (',
    ].join('\n'),
  },

  // ── agente: efectivo por confirmar ─────────────────────────────────────────
  {
    archivo: 'app/agente.tsx',
    viejo: [
      '          {operaciones.length === 0 ? (',
      '            <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>Nada por confirmar.</Text>',
      '          ) : operaciones.map((op) => {',
    ].join('\n'),
    nuevo: [
      '          {operaciones.length === 0 ? (',
      '            /*',
      '              Aquí NO hay botón, y es a propósito: el agente no puede provocar una operación de',
      '              efectivo, solo confirmarla cuando el cliente le enseña el código. La «acción» de',
      '              este vacío es saber qué lo llena; un botón sería relleno.',
      '            */',
      '            <EmptyState',
      '              compacto',
      '              icono={<Banknote size={26} color={colors.textSecondary} />}',
      '              titulo="Nada por confirmar"',
      '              texto="Cuando un cliente te enseñe su código de recarga o de retirada, la operación aparecerá aquí para que la cierres."',
      '            />',
      '          ) : operaciones.map((op) => {',
    ].join('\n'),
  },

  // ── agente: recados de compra protegida ────────────────────────────────────
  {
    archivo: 'app/agente.tsx',
    viejo: [
      '          {recados.length === 0 ? (',
      '            <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>No tienes recados en curso.</Text>',
      '          ) : recados.map((r: RecadoEscrow) => {',
    ].join('\n'),
    nuevo: [
      '          {recados.length === 0 ? (',
      '            <EmptyState',
      '              compacto',
      '              icono={<PackageOpen size={26} color={colors.textSecondary} />}',
      '              titulo="No tienes recados en curso"',
      '              texto="Los recados de compra protegida te llegan asignados: recoges el paquete y lo entregas al comprador, que confirma al recibirlo."',
      '            />',
      '          ) : recados.map((r: RecadoEscrow) => {',
    ].join('\n'),
  },
];

// Imports que hay que ampliar una sola vez por archivo
const imports = [
  {
    archivo: 'app/billing-status.tsx',
    viejo: "import { ArrowLeft, BadgeCheck, Clock, Package, XCircle } from 'lucide-react-native';",
    nuevo: "import { ArrowLeft, BadgeCheck, Clock, Package, Receipt, XCircle } from 'lucide-react-native';",
  },
  {
    archivo: 'app/billing-status.tsx',
    viejo: "import { useTheme, alpha, PrimaryButton, GhostButton, Sheet, Aviso } from '@egrouteplan/ui-kit';",
    nuevo: "import { useTheme, alpha, PrimaryButton, GhostButton, Sheet, Aviso, EmptyState } from '@egrouteplan/ui-kit';",
  },
  {
    archivo: 'app/agente.tsx',
    viejo: "import { PrimaryButton, useTheme } from '@egrouteplan/ui-kit';",
    nuevo: "import { EmptyState, PrimaryButton, useTheme } from '@egrouteplan/ui-kit';",
  },
];

for (const c of casos) {
  const p = path.join(APP, c.archivo);
  let t = fs.readFileSync(p, 'utf8');
  if (!t.includes(c.viejo)) { console.log(`  SIN ANCLA: vacío en ${c.archivo}`); fallos++; continue; }
  t = t.replace(c.viejo, c.nuevo);
  fs.writeFileSync(p, t, 'utf8');
  console.log(`  OK vacío sustituido en ${c.archivo}`);
}

for (const i of imports) {
  const p = path.join(APP, i.archivo);
  let t = fs.readFileSync(p, 'utf8');
  if (t.includes(i.nuevo)) { console.log(`  YA ESTABA: import en ${i.archivo}`); continue; }
  if (!t.includes(i.viejo)) { console.log(`  SIN ANCLA: import en ${i.archivo}`); fallos++; continue; }
  t = t.replace(i.viejo, i.nuevo);
  fs.writeFileSync(p, t, 'utf8');
  console.log(`  OK import en ${i.archivo}`);
}

console.log(fallos ? `\n${fallos} problema(s): revisar a mano` : '\nVacíos de facturación y agente con salida');
process.exit(fallos ? 1 : 0);
