/**
 * Fase 2 · punto 25 — Plegar el checkout: lo accesorio detrás de un enlace.
 *
 * QUÉ DICE EL INFORME: «mover lo accesorio (nota, cupón, hora, zona) detrás de un “más opciones” en
 * los 4 checkouts». Al ir a hacerlo, dos de esos cuatro NO son accesorios, y plegarlos habría sido
 * un error de diseño, no una mejora:
 *
 *   · **Zona de entrega** (`ecomerse-checkout`): su propia etiqueta dice «define la tarifa». Elegir
 *     zona cambia lo que pagas; esconderla es esconder el precio.
 *   · **Cupón** (`lifebook-checkout` y `lifebook-carrito-checkout`): cambia el total, y el código ya
 *     documenta la decisión contraria — «se piden MIS cupones al abrir la caja (no al pulsar
 *     pagar): el descuento tiene que verse ANTES de confirmar».
 *   · **Hora**: no existe como campo en ninguno de los cuatro checkouts (se buscó).
 *
 * Lo que SÍ es accesorio es **la nota / mensaje al vendedor**: no cambia la cifra, no es obligatorio
 * y ocupaba el mismo peso visual que la dirección y el pago. Eso es lo que se pliega, en los tres
 * checkouts que la tienen.
 *
 * Se hace con un primitivo NUEVO del kit (`MasOpciones`) y no con tres copias a mano: tres copias
 * del mismo despliegue es exactamente el anti-patrón que la auditoría llama «el coste de no tener un
 * patrón». El primitivo usa las escalas declaradas (`tipografia`, `espaciado`, `peso`).
 *
 * `abiertoInicial` no es un adorno: si el usuario YA escribió una nota, su texto no puede quedar
 * escondido al volver a la pantalla.
 *
 * Uso: node pruebas/fase2-plegar-checkout.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

const casos = [
  // ── Comida ─────────────────────────────────────────────────────────────────
  {
    archivo: 'app/food-checkout.tsx',
    importViejo: "import { useTheme, alpha, PrimaryButton, FormField } from '@egrouteplan/ui-kit';",
    importNuevo: "import { useTheme, alpha, PrimaryButton, FormField, MasOpciones } from '@egrouteplan/ui-kit';",
    viejo: [
      '              <Text style={s.label}>Nota (opcional)</Text>',
      '              <TextInput',
      '                value={note}',
      '                onChangeText={setNote}',
      '                placeholder="Ej: sin cebolla, llamar al llegar…"',
      '                placeholderTextColor={colors.textSecondary}',
      '                multiline',
      '                maxLength={500}',
      '                style={[s.area, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}',
      '              />',
    ].join('\n'),
    nuevo: [
      '              {/*',
      '                Plegado (Fase 2 · punto 25): la nota es lo ÚNICO accesorio de esta pantalla. La',
      '                dirección y el método de pago se quedan a la vista — sin ellos no hay pedido —.',
      '                La etiqueta «Nota (opcional)» desaparece porque el enlace ya dice qué se añade.',
      '              */}',
      '              <MasOpciones',
      '                abrir="Añadir una nota para el restaurante"',
      '                cerrar="Ocultar la nota"',
      "                abiertoInicial={note.trim() !== ''}",
      '              >',
      '                <TextInput',
      '                  value={note}',
      '                  onChangeText={setNote}',
      '                  placeholder="Ej: sin cebolla, llamar al llegar…"',
      '                  placeholderTextColor={colors.textSecondary}',
      '                  multiline',
      '                  maxLength={500}',
      '                  style={[s.area, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}',
      '                />',
      '              </MasOpciones>',
    ].join('\n'),
  },

  // ── Mercado ────────────────────────────────────────────────────────────────
  {
    archivo: 'app/ecomerse-checkout.tsx',
    importViejo: "import { useTheme, alpha, PrimaryButton, FormField } from '@egrouteplan/ui-kit';",
    importNuevo: "import { useTheme, alpha, PrimaryButton, FormField, MasOpciones } from '@egrouteplan/ui-kit';",
    viejo: [
      '          <Text style={s.label}>Nota para el vendedor (opcional)</Text>',
      '          <FormField value={note} onChangeText={setNote} placeholder="Ej: llamar al llegar" />',
    ].join('\n'),
    nuevo: [
      '          {/* Lo único accesorio de esta pantalla. La ZONA no se pliega: define la tarifa. */}',
      '          <MasOpciones',
      '            abrir="Añadir una nota para el vendedor"',
      '            cerrar="Ocultar la nota"',
      "            abiertoInicial={note.trim() !== ''}",
      '          >',
      '            <FormField value={note} onChangeText={setNote} placeholder="Ej: llamar al llegar" />',
      '          </MasOpciones>',
    ].join('\n'),
  },

  // ── Carrito de Life Book (una nota POR TIENDA) ─────────────────────────────
  {
    archivo: 'app/lifebook-carrito-checkout.tsx',
    importViejo: "import { alpha, useTheme, PinSheet, brand } from '@egrouteplan/ui-kit';",
    importNuevo: "import { alpha, useTheme, PinSheet, brand, MasOpciones } from '@egrouteplan/ui-kit';",
    viejo: [
      '              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>MENSAJE PARA ESTA TIENDA (opcional)</Text>',
      '              <TextInput',
      '                value={nota[clave] ?? \'\'}',
      '                onChangeText={(t) => setNota((prev) => ({ ...prev, [clave]: t }))}',
      '                placeholder="Ej.: llamar al llegar, entregar por la tarde…"',
      '                placeholderTextColor={colors.textSecondary}',
      '                maxLength={300}',
      '                style={input}',
      '              />',
    ].join('\n'),
    nuevo: [
      '              {/*',
      '                Plegado (Fase 2 · punto 25). Es una nota POR TIENDA: cada tienda recibe su pedido.',
      '                El CUPÓN de abajo NO se pliega: cambia el total y el descuento tiene que verse',
      '                antes de confirmar (decisión documentada en la tanda Q).',
      '              */}',
      '              <MasOpciones',
      '                abrir="Añadir un mensaje para esta tienda"',
      '                cerrar="Ocultar el mensaje"',
      "                abiertoInicial={(nota[clave] ?? '').trim() !== ''}",
      '              >',
      '                <TextInput',
      '                  value={nota[clave] ?? \'\'}',
      '                  onChangeText={(t) => setNota((prev) => ({ ...prev, [clave]: t }))}',
      '                  placeholder="Ej.: llamar al llegar, entregar por la tarde…"',
      '                  placeholderTextColor={colors.textSecondary}',
      '                  maxLength={300}',
      '                  style={input}',
      '                />',
      '              </MasOpciones>',
    ].join('\n'),
  },
];

for (const c of casos) {
  const p = path.join(APP, c.archivo);
  let t = fs.readFileSync(p, 'utf8');
  // Idempotente: si ya está plegado, no se toca (así se puede re-ejecutar el script sin ruido).
  if (t.includes('<MasOpciones')) { console.log(`  YA ESTABA: ${c.archivo}`); continue; }
  if (!t.includes(c.viejo)) { console.log(`  SIN ANCLA: ${c.archivo}`); fallos++; continue; }
  if (!t.includes(c.importViejo)) { console.log(`  SIN ANCLA: import en ${c.archivo}`); fallos++; continue; }
  t = t.replace(c.viejo, c.nuevo);
  t = t.replace(c.importViejo, c.importNuevo);
  fs.writeFileSync(p, t, 'utf8');
  console.log(`  OK ${c.archivo}: nota plegada`);
}

console.log(fallos ? `\n${fallos} problema(s): revisar a mano` : '\nNotas del checkout plegadas (zona y cupón NO: cambian el dinero)');
process.exit(fallos ? 1 : 0);
