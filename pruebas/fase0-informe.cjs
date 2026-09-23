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

rep(
  '| 0.3 | Etiquetas y anuncio de error en `PinSheet` + etiquetas distintas en `monedero-pin` + `accessibilityState` en la elección de agente + `hitSlop` en cantidades | D-46 a D-51 |',
  '| 0.3 | ✅ **HECHO** — Etiquetas y anuncio de error del PIN, etiquetas distintas en `monedero-pin`, `accessibilityState` en la elección de agente y `hitSlop` en los botones de cantidad del mercado | D-46 a D-51 |',
  'fila 0.3');

rep(
  '| 0.5 | Botón real de «Verificar mi identidad» en los avisos de KYC del monedero y entrada al KYC desde Perfil | D-33 |',
  '| 0.5 | ✅ **HECHO** — Cuando el monedero responde `KYC_REQUIRED`, recargar y retirar ya muestran un botón «Verificar mi identidad →» que va al KYC real. Y el CTA del vendedor (`ecomerse-seller.tsx`) ya **no** lleva al alta de **conductor**: va al KYC | D-33 |',
  'fila 0.5');

rep(
  '| 0.6 | Token de pago en el carrito de Life Book: reutilizar el flujo de PIN de `lifebook-checkout.tsx` y no anunciar «Pago exitoso» antes de que el servidor confirme | **D-36** |',
  `| 0.6 | ✅ **HECHO** — El carrito pide el PIN del monedero y obtiene un **token por tienda** (el token va atado al importe exacto), lo envía a \`create()\` como tercer argumento y **olvida los tokens usados** (son de un solo uso). Si el envío está «a consultar» **no hay importe que firmar**: se dice claro y se ofrecen efectivo o pagar desde la ficha del producto, en vez de ofrecer un pago que no puede completarse | **D-36** |`,
  'fila 0.6');

rep(
  '| 0.7 | Canal de soporte real, o retirar la promesa de los textos que remiten a él | D-37 |',
  '| 0.7 | ⏳ **ESPERA TU DATO** — Necesito **el contacto de soporte real** (teléfono/WhatsApp o correo). En el código no hay ninguno: los cuatro enlaces de Ajustes responden «Próximamente» y tres pantallas de dinero remiten a un soporte que no existe. En cuanto me lo des, lo cableo en un solo sitio y dejo de prometer lo que no hay. **No invento un número** | D-37 |',
  'fila 0.7');

rep(
  '| 0.8 | «Reservar Coche»: dejar de presentar un precio derivado de la longitud del texto; rotularlo como «sin calcular» | **D-35** |',
  `| 0.8 | ✅ **HECHO** — Fuera la función que calculaba el «precio» a partir de la **longitud del texto** escrito en origen/destino, fuera los «km aprox.» inventados y fuera el envío de ese número al servidor. Ahora la tarjeta dice «Tu presupuesto» si el usuario puso uno, o **«A convenir»**, con la frase «El conductor confirma el precio al aceptar. La app no lo estima.» | **D-35** |`,
  'fila 0.8');

rep(
  '| 0.9 | Parar el sondeo del KYC cuando ya es terminal (`kyc/status.tsx:64`) — **media hora de trabajo y elimina el peor de los 52 temporizadores** | **D-54** |',
  `| 0.9 | ✅ **HECHO** — El sondeo de \`kyc/status\` guarda su temporizador y **lo para en cuanto el estado es terminal**: antes seguía cada 1,5 s **para siempre**, incluso con el KYC aprobado (batería, datos y peticiones sin motivo). \`isTerminal\` existía y solo se usaba para pintar | **D-54** |`,
  'fila 0.9');

fs.writeFileSync(f, t, 'utf8');
console.log(fallos ? `\n${fallos} anclaje(s) fallidos` : '\nInforme actualizado');
