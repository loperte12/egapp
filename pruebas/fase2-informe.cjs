const fs = require('fs');
const path = require('path');
const f = path.resolve(__dirname, '..', 'design-audit-report.md');
let t = fs.readFileSync(f, 'utf8');
let fallos = 0;
function rep(from, to, label) {
  if (!t.includes(from)) { console.log(`  SIN ANCLA: ${label}`); fallos++; return; }
  t = t.split(from).join(to);
  console.log(`  OK ${label}`);
}

// Fase 0: el soporte ya es real
rep(
  '| 0.7 | ⏳ **ESPERA TU DATO** — Necesito **el contacto de soporte real** (teléfono/WhatsApp o correo). En el código no hay ninguno: los cuatro enlaces de Ajustes responden «Próximamente» y tres pantallas de dinero remiten a un soporte que no existe. En cuanto me lo des, lo cableo en un solo sitio y dejo de prometer lo que no hay. **No invento un número** | D-37 |',
  '| 0.7 | ✅ **HECHO** — Fuente única en `constants/soporte.ts` (`egrouteplan@gmail.com` · **+8615504426087**). Ajustes ya **no** dice «Próximamente»: hay cuatro filas que abren WhatsApp, escriben un correo, llaman o reportan un problema. Y los tres avisos de dinero que remitían a un soporte inexistente (`billing-status` ×3, `kyc/status`) ahora llevan el contacto y un botón para pedir el reembolso por WhatsApp. *(Ojo: el número que me diste es **+86**, China. Si querías el de Guinea Ecuatorial, se cambia en ese único archivo.)* | D-37 |',
  'F0.7 hecho');

// Nueva sección de Fase 2
rep(
  '---

## 12. La reconstrucción del APK: lo que exigió (17/09/2026)',
  `---

## 11-bis. Estado de ejecución de la Fase 2 (17/09/2026)

| # | Acción | Estado | Qué se hizo |
|---|---|---|---|
| 14 | Escala única de tipo, espacio y radio | ✅ **Declarada** (migración pendiente) | Nuevo \`packages/ui-kit/src/theme/escalas.ts\` con \`tipografia\` (11/12/14/16/20/28), \`espaciado\` (4/8/12/16/24/32), \`radios\` (8/12/16/999) y \`peso\`. Exportadas por el kit y por el shim. **La app todavía no las usa**: sustituir 2.801 \`fontSize\` y 1.258 \`borderRadius\` es un barrido guiado que va por tandas, no de golpe |
| 15 | Peso 400 como base | ✅ **Declarado** | \`peso.normal: '400'\` existe ya en el kit. La app sigue sin usarlo en general (todo estaba en 500–900, por eso nada destacaba) |
| 16 | Colapsar las paletas paralelas | ✅ **Hecho** | **134 valores** de las familias paralelas sustituidos por tokens: 11 verdes de «éxito» → \`success\`, 16 ámbares → \`warning\`, rojos claros → \`danger\` y oscuros → \`dangerText\` (nuevo, porque \`danger\` como texto no llega a AA), azules → \`primary\`/\`info\`. Y dos falsos positivos retirados: \`#25D366\` **no** era un verde de éxito, es la marca de WhatsApp; y \`#adFade\` **no era un color**, era el identificador de un degradado SVG (el analista de color lo contó como color) |
| 16-bis | Un solo naranja y un solo blanco | ✅ **Hecho** | \`#FF6B35\` (**53 usos en 17 archivos**) → \`brand.secondary\`, el naranja oficial. Y **538 \`#FFFFFF\`** → \`brand.white\`: mismo valor, cero cambio visual, pero desaparece el blanco escrito a mano. **Los literales de color bajan de 915 a 190** (un 79 % menos) y la guardia \`npm run diseno\` queda fijada ahí |
| 17 | Naranja de acción principal | 🟡 **A medias, espera tu ojo** | El naranja ya es **uno** (el oficial). Lo que queda es una decisión de jerarquía: hoy hay **6 constantes \`ACCENT\` locales** y botones de acción principal en naranja (\`btnPrimary\`, \`buyBtn\`, \`retryBtn\`). La regla del kit es *azul avanza, naranja clasifica*: cambiarlo afecta a 17 archivos y quiero que lo veas antes |
| 18 | Contraste AA | 🟡 **A medias** | \`textSecondary\` del tema claro pasa de **3,24:1 a 4,76:1** (cumple AA). **Falta tu validación** para los fondos de color: blanco sobre \`secondary\` es 2,57, sobre \`primary\` 3,66, sobre \`danger\` 3,71 — o se oscurecen los tokens (decisión de marca) o el texto de esos botones va en oscuro |
| 19-25 | Modales, errores, listas, imágenes, estados vacíos, códigos de error y plegado del checkout | ⏳ Pendiente | Siguiente tanda |

### Lo que NO se tocó a propósito (y por qué)

- **Violetas y magentas** (\`#E0439A\`, \`#8B5CF6\`, \`#7C3AED\`, \`#B57BFF\`, \`#FF7BAC\`): **27 usos sin significado declarado**. Mapearlos a ciegas sería inventar semántica. Hay que decidir qué son (¿creador? ¿social? ¿destacado?) y entonces darles token.
- **Grises de texto** (\`#8E8E93\`, \`#86909C\`, \`#111827\`, \`#CBD5E1\`): son el \`textSecondary\` viejo y compañía. Convertirlos a \`colors.textSecondary\` cambia el color según el tema, así que va con la migración de las escalas.
- **\`#000000\` (19)**: son \`shadowColor\` sueltos; la mayoría debería salir de la escala \`elevation\`.

---

## 12. La reconstrucción del APK: lo que exigió (17/09/2026)`,
  'sección 11-bis de Fase 2');

fs.writeFileSync(f, t, 'utf8');
console.log(fallos ? `\n${fallos} anclaje(s) fallidos` : '\nInforme actualizado');
