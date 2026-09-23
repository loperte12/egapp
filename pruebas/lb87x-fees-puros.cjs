// lb87x-fees-puros.cjs — LA ARITMÉTICA DEL DINERO, con números (punto 8 de la §3).
//
// `orders-fees.ts` es una función pura a propósito: el desglose de un pedido se puede probar sin
// arrancar el servidor y sin tocar Postgres. Aquí se comprueban los casos que importan —sobre todo el
// choque entre el MÍNIMO (500) y el TOPE (40 %), que es donde una tienda podría acabar pagando por
// vender— y una propiedad que tiene que cumplirse SIEMPRE: la tienda nunca recibe menos de cero.
//
// Uso:  node /root/lb87x.cjs
const fees = require('/opt/mirror/app/dist/src/lifebook/orders-fees.js');

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos++; };

console.log('=== CASOS CON NÚMEROS ===');
const casos = [
  // productos, entrega, comisión esperada, a pagar esperado, topeAplicado, por qué
  [12000, 0, 960, 11040, false, '8 % de 12 000 = 960 (por encima del mínimo)'],
  [10000, 1500, 800, 9200, false, '8 % = 800 y la entrega NO se comisiona (va al reparto)'],
  [1000, 0, 400, 600, true, '8 % = 80 → el mínimo lo sube a 500 → el TOPE del 40 % (400) manda'],
  [6000, 0, 500, 5500, false, '8 % = 480 → manda el mínimo de 500, sin llegar al tope'],
  [6250, 0, 500, 5750, false, 'justo en el mínimo: 8 % = 500, sin tope'],
  [0, 1500, 0, 0, false, 'pedido sin importe: ni comisión ni sorpresas'],
];
for (const [productos, entrega, comision, aPagar, tope, porque] of casos) {
  const f = fees.computeOrderFees(productos, entrega);
  const ok = f.comisionXaf === comision && f.aPagarTiendaXaf === aPagar && f.topeAplicado === tope && f.totalXaf === productos + entrega;
  comprobar(ok, `${productos} + ${entrega} de entrega → comisión ${f.comisionXaf} · a pagar ${f.aPagarTiendaXaf} · total ${f.totalXaf} · tope ${f.topeAplicado} — ${porque}`);
}

console.log('\n=== LA PROPIEDAD QUE NO SE PUEDE ROMPER (0 a 30 000 XAF) ===');
let negativos = 0, comisionPorEncimaDelTope = 0, descuadres = 0, topeados = 0;
for (let productos = 0; productos <= 30000; productos += 7) {
  const f = fees.computeOrderFees(productos, 1500);
  if (f.aPagarTiendaXaf < 0) negativos++;
  if (productos > 0 && f.comisionXaf > Math.round((productos * 40) / 100)) comisionPorEncimaDelTope++;
  if (f.totalXaf !== productos + 1500 || f.aPagarTiendaXaf + f.comisionXaf !== productos) descuadres++;
  if (f.topeAplicado) topeados++;
}
comprobar(negativos === 0, `la tienda NUNCA queda en negativo (${negativos} casos de 4 286)`);
comprobar(comisionPorEncimaDelTope === 0, `la comisión NUNCA pasa del tope del 40 % (${comisionPorEncimaDelTope} casos)`);
comprobar(descuadres === 0, `el desglose siempre cuadra: a pagar + comisión = productos y el total lo paga el comprador (${descuadres} descuadres)`);
console.log(`  (el tope tuvo que recortar en ${topeados} de esos importes: son los pedidos baratos)`);

console.log('\n=== LA CONFIGURACIÓN QUE VIENE DE LA BASE ===');
const deBase = fees.aConfigFee({ platform_percent: '8.00', platform_min_xaf: 500, max_total_percent: '40.00' });
comprobar(deBase.platformPercent === 8 && deBase.platformMinXaf === 500 && deBase.maxTotalPercent === 40,
  `un «numeric» de Postgres llega como texto y se convierte bien: ${JSON.stringify(deBase)}`);
const vacia = fees.aConfigFee(undefined);
comprobar(vacia.platformPercent === 8 && vacia.platformMinXaf === 500,
  `sin fila en la base se usan los números decididos: ${JSON.stringify(vacia)}`);

console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
process.exit(fallos === 0 ? 0 : 1);
