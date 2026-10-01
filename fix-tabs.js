const fs = require('fs');
let s = fs.readFileSync('app/lifebook-hotel-detalle.tsx', 'utf8');
s = s.replace(/\r\n/g, '\n');
let n = 0;

function r(old, rep, label) {
  if (!s.includes(old)) {
    console.error('NOT FOUND: ' + label);
    // Show nearby context for debugging
    const idx = s.indexOf(old.substring(0, 60));
    if (idx >= 0) {
      console.error('  Partial match at index ' + idx);
      console.error('  Context: ' + s.substring(Math.max(0, idx - 20), idx + 100));
    }
    process.exit(1);
  }
  s = s.replace(old, rep);
  n++;
  console.log('OK: ' + label);
}

// ── 1. Replace scroll refs + add tab state ──
r(
  'const scrollRef = useRef<ScrollView>(null);\n  const [yContenido, setYContenido] = useState(0);\n  const [yResenas, setYResenas] = useState(0);\n  const bajarAResenas = () => {\n    scrollRef.current?.scrollTo({ y: Math.max(0, yContenido + yResenas - espaciado.e10), animated: true });\n  };',
  "const [tab, setTab] = useState<'reservar' | 'resenas' | 'alojamiento'>('reservar');",
  'scroll refs → tab state'
);

// ── 2. Note chip: bajarAResenas → setTab ──
r(
  'onPress={bajarAResenas}',
  "onPress={() => setTab('resenas')}",
  'note chip onPress'
);

// ── 3. ScrollView: remove ref, simplify contentContainerStyle ──
r(
  '<ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: insets.bottom + 30, gap: espaciado.e14 }}>',
  '<ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>',
  'scrollview attrs'
);

// ── 4. Insert tab bar after PhotoGallery closing, before content View ──
// Find the PhotoGallery closing /> followed by the content View
r(
  '          />\n\n          <View style={{ paddingHorizontal: espaciado.e14, gap: espaciado.e14 }} onLayout={(e) => setYContenido(e.nativeEvent.layout.y)}>\n          {/* ── Datos del alojamiento ── */}',
  `          />

          {/* D8: barra de pestañas — Habitaciones · Reseñas · El alojamiento */}
          <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => setTab('reservar')}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === 'reservar' }}
              style={[styles.tabBtn, tab === 'reservar' ? { borderBottomColor: colors.primary, borderBottomWidth: trazo.fuerte } : null]}
            >
              <Text style={[styles.tabTxt, { color: tab === 'reservar' ? colors.textPrimary : colors.textSecondary, fontWeight: tab === 'reservar' ? peso.maximo : peso.medio }]}>
                Habitaciones{rooms.length ? \` (\${rooms.length})\` : ''}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('resenas')}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === 'resenas' }}
              style={[styles.tabBtn, tab === 'resenas' ? { borderBottomColor: colors.primary, borderBottomWidth: trazo.fuerte } : null]}
            >
              <Text style={[styles.tabTxt, { color: tab === 'resenas' ? colors.textPrimary : colors.textSecondary, fontWeight: tab === 'resenas' ? peso.maximo : peso.medio }]}>
                Rese\u00f1as{resenas && resenas.total > 0 ? \` (\${resenas.total})\` : ''}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('alojamiento')}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === 'alojamiento' }}
              style={[styles.tabBtn, tab === 'alojamiento' ? { borderBottomColor: colors.primary, borderBottomWidth: trazo.fuerte } : null]}
            >
              <Text style={[styles.tabTxt, { color: tab === 'alojamiento' ? colors.textPrimary : colors.textSecondary, fontWeight: tab === 'alojamiento' ? peso.maximo : peso.medio }]}>
                El alojamiento
              </Text>
            </Pressable>
          </View>

          {/* ── Tab: El alojamiento ── */}
          {tab === 'alojamiento' && (
          <View style={{ paddingHorizontal: espaciado.e14, gap: espaciado.e14 }}>
          {/* ── Datos del alojamiento ── */}`,
  'tab bar + alojamiento open'
);

// ── 5. After the bloque informativo closes (</View> of the main card), before Habitaciones ──
// Find: closing of the alojamiento info card + the Habitaciones heading
r(
  '          </View>\n\n          {/* ── Habitaciones ── */}\n          <Text style={[styles.seccion, { color: colors.textPrimary }]}>\n            Habitaciones ({rooms.length})\n          </Text>',
  `          </View>
          )}

          {/* ── Tab: Habitaciones (Reservar) ── */}
          {tab === 'reservar' && (
          <View style={{ paddingHorizontal: espaciado.e14, gap: espaciado.e14 }}>

          <Text style={[styles.seccion, { color: colors.textPrimary }]}>
            Habitaciones ({rooms.length})
          </Text>`,
  'close alojamiento + open reservar'
);

// ── 6. After rooms.map closing, before RESEÑAS ──
r(
  '          {/* ── RESEÑAS',
  `          </View>
          )}

          {/* ── Tab: Reseñas ── */}
          {tab === 'resenas' && (
          <View style={{ paddingHorizontal: espaciado.e14, gap: espaciado.e14 }}>
          {/* ── RESEÑAS`,
  'close reservar + open resenas'
);

// ── 7. After reseñas section closes (the </View> with onLayout for yResenas), close tab ──
r(
  'onLayout={(e) => setYResenas(e.nativeEvent.layout.y)} style={{ gap: espaciado.e10 }}>',
  'style={{ gap: espaciado.e10 }}>',
  'remove yResenas onLayout'
);

// ── 8. Close the resenas tab and the outer View ──
// The current structure after reseñas section:
//   </View>   ← reseñas section
//   </View>   ← outer content wrapper
// </ScrollView>
r(
  '          </View>\n          </View>\n        </ScrollView>',
  '          </View>\n          )}\n          </View>\n        </ScrollView>',
  'close resenas tab'
);

// ── 9. Add tab styles ──
r(
  'respuestaEtq: { fontSize: tipografia.micro, fontWeight: peso.maximo },\n});',
  `respuestaEtq: { fontSize: tipografia.micro, fontWeight: peso.maximo },
  // D8: barra de pestañas de la ficha.
  tabBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e16, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e4, borderBottomWidth: trazo.fino },
  tabBtn: { paddingVertical: espaciado.e8, borderBottomWidth: 2, borderBottomColor: 'transparent', minWidth: 80, alignItems: 'center' },
  tabTxt: { fontSize: tipografia.body },
});`,
  'tab styles'
);

// Restore CRLF
s = s.replace(/\n/g, '\r\n');
fs.writeFileSync('app/lifebook-hotel-detalle.tsx', s, 'utf8');
console.log('Total replacements: ' + n);
