/**
 * Fase 0 — segunda mitad (auditoría de diseño EG Route Plan).
 *   0.5  El aviso de KYC del monedero lleva a verificar la identidad (D-33).
 *   0.8  «Reservar Coche» deja de presentar un precio inventado (D-35).
 * Uso: node pruebas/fase0-monedero-y-reserva.cjs
 */
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..');
let fallos = 0;

function rep(rel, from, to, label) {
  const p = path.join(APP, rel);
  if (!fs.existsSync(p)) { console.log(`  FALTA ${rel}`); fallos++; return; }
  const t = fs.readFileSync(p, 'utf8');
  if (!t.includes(from)) { console.log(`  SIN ANCLA: ${label}`); fallos++; return; }
  fs.writeFileSync(p, t.split(from).join(to), 'utf8');
  console.log(`  OK ${label}`);
}

// ── 0.5 · el aviso de KYC del monedero tiene que llevar a algún sitio ────────────────────────────
const BOTON = `{formErr && <Text style={{ color: brand.danger, fontSize: 13, marginTop: 10 }}>{formErr}</Text>}
          {/*
            AUDITORÍA DE DISEÑO (D-33): el monedero exige identidad verificada y el aviso solo
            pintaba texto. El usuario elegía importe, agente y PIN para descubrir al final que no
            podía seguir, y no había ninguna salida. Aquí está la puerta.
          */}
          {kycFalta && (
            <Tactil
              onPress={() => router.push('/kyc')}
              accessibilityRole="button"
              accessibilityLabel="Verificar mi identidad"
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: colors.primary, fontSize: 13.5, fontWeight: '800' }}>Verificar mi identidad →</Text>
            </Tactil>
          )}`;

for (const n of ['monedero-recargar.tsx', 'monedero-retirar.tsx']) {
  const rel = `app/${n}`;
  rep(rel,
    'const [formErr, setFormErr] = useState<string | null>(null);',
    `const [formErr, setFormErr] = useState<string | null>(null);
  /** El monedero exige identidad verificada: si el servidor la pide, hay que poder ir a hacerla. */
  const [kycFalta, setKycFalta] = useState(false);`,
    `${n}: estado kycFalta`);
  rep(rel, '        setFormErr(msg);', `        setFormErr(msg);
        setKycFalta(true);`, `${n}: marcar que falta el KYC`);
  rep(rel,
    '{formErr && <Text style={{ color: brand.danger, fontSize: 13, marginTop: 10 }}>{formErr}</Text>}',
    BOTON, `${n}: botón de verificar identidad`);
}

// ── 0.8 · Reservar Coche deja de inventarse el precio ────────────────────────────────────────────
const R = 'app/reserva.tsx';
rep(R,
  ` * Reglas conservadas: el día solo permite hoy..hoy+3; estimación del sistema
 * al cambiar origen/destino; presupuesto opcional; Confirmar exige
 * origen+destino+día (vehículo con default eco).`,
  ` * Reglas conservadas: el día solo permite hoy..hoy+3; presupuesto opcional; Confirmar exige
 * origen+destino+día (vehículo con default eco).
 *
 * PRECIO (Fase 0 de la auditoría de diseño, D-35): esta pantalla presentaba como «precio estimado
 * por algoritmo» una cifra calculada a partir de la LONGITUD DEL TEXTO escrito en origen y
 * destino, bajo un icono «Seguro». Se retiró: un precio que no depende de la ruta no es un precio.
 * Ahora, o lo propone el usuario (presupuesto) o lo acuerda el conductor.`,
  'reserva: cabecera honesta');
rep(R,
  'const estimate = (km: number) => Math.round((2000 + 200 * km) / 100) * 100;',
  '/* (retirado en la Fase 0) `estimate(km)` inventaba un precio a partir de la longitud del texto. */',
  'reserva: fuera «estimate»');
rep(R, '  const [routeKm, setRouteKm] = useState(5);\n', '', 'reserva: fuera el estado de km');
rep(R,
  `  // -------- origen/destino cambian → recalculan estimación (simulada por ahora)
  const handleOriginChange = (t: string) => { setOrigin(t); setRouteKm(Math.round(5 + (t.length % 4) * 2 + (dest.length % 3))); };
  const handleDestChange = (t: string) => { setDest(t); setRouteKm(Math.round(5 + (dest.length % 4) * 2 + (t.length % 3))); };`,
  `  const handleOriginChange = (t: string) => setOrigin(t);
  const handleDestChange = (t: string) => setDest(t);`,
  'reserva: manejadores sin simulación');
rep(R, '  const price = estimate(routeKm);',
  '  /** El precio NO se calcula aquí: es el presupuesto del usuario o se acuerda con el conductor. */',
  'reserva: fuera el precio simulado');
rep(R, '  const budgetNum = budget ? Number(budget) : null;',
  `  const budgetNum = budget ? Number(budget) : null;
  const price = budgetNum ?? 0;`,
  'reserva: el precio es el presupuesto (0 = a convenir)');
rep(R, 'text={`${vehicleName} · ${routeKm} km aprox.`}', 'text={vehicleName}', 'reserva: fuera los km inventados');
rep(R,
  `            {/* Precio (algoritmo) */}
            <View style={s.card}>
              <Text style={s.label}>Precio estimado por algoritmo</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text style={s.priceBig} accessibilityLabel={\`\${price} francos CFA\`}>{price.toLocaleString('es')} XAF</Text>
                <Text style={s.miniLabel}>{routeKm} km aprox.</Text>
              </View>
            </View>`,
  `            {/* Precio: el del usuario o «a convenir». NO se inventa. */}
            <View style={s.card}>
              <Text style={s.label}>{price > 0 ? 'Tu presupuesto' : 'Precio'}</Text>
              <Text style={s.priceBig} accessibilityLabel={price > 0 ? \`\${price} francos CFA\` : 'A convenir con el conductor'}>
                {price > 0 ? \`\${price.toLocaleString('es')} XAF\` : 'A convenir'}
              </Text>
              <Text style={s.miniLabel}>El conductor confirma el precio al aceptar. La app no lo estima.</Text>
            </View>`,
  'reserva: tarjeta de precio honesta');
rep(R, '        estimatedPrice: price,\n', '', 'reserva: no se envía un precio inventado');
rep(R,
  "`Confirmar · ${price.toLocaleString('es')} XAF`",
  "price > 0 ? `Confirmar · ${price.toLocaleString('es')} XAF` : 'Confirmar reserva'",
  'reserva: botón sin cifra falsa');

console.log(fallos ? `\n${fallos} anclaje(s) fallidos` : '\nTodos los cambios aplicados');
process.exit(fallos ? 1 : 0);
