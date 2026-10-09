# EG Route Plan — App móvil (Expo + TypeScript)

Super-app de movilidad y servicios para Guinea Ecuatorial. Home Screen completa:
mapa a pantalla completa, BottomSheet con buscador y 8 servicios, carrusel
promocional, footer flotante y modal de emergencia — con tema claro/oscuro.

## Arranque

```bash
cd egrouteplan-app
pnpm install          # o npm install / yarn
npx expo install      # alinea versiones nativas al SDK instalado (recomendado)
pnpm start            # abre Expo Go y escanea el QR
```

> **react-native-maps**: en Expo Go funciona sin configuración. Para builds de
> producción en Android, añade tu `GOOGLE_MAPS_API_KEY` en `app.json →
> android.config.googleMaps.apiKey` (EAS Build). iOS usa Apple Maps por defecto.

## Estructura

```
egrouteplan-app/
├── app/                      ← Expo Router
│   ├── _layout.tsx           ← GestureHandlerRootView + ThemeProvider + Stack
│   ├── index.tsx             ← HomeScreen (composición de todo)
│   ├── service/[id].tsx      ← stub de detalle de servicio (navegación simulada)
│   └── promo/[id].tsx        ← stub de detalle de oferta
├── constants/
│   ├── colors.ts             ← TOKENS tipados (paleta + light/dark) — ÚNICA fuente
│   └── data.ts               ← servicios, promos, contactos de emergencia, ciudades
├── theme/ThemeContext.tsx    ← modo claro/oscuro (sistema + override manual)
└── components/
    ├── MapBackground.tsx     ← MapView full-screen con estilo limpio por tema
    ├── LocationBadge.tsx     ← badge superior-izquierda "Malabo" + modal de ciudades
    ├── MapTools.tsx          ← botones flotantes: recentrar + escáner/traductor
    ├── SearchHeader.tsx      ← ubicación clicable + barra "Buscar destino"
    ├── ServiceGrid.tsx       ← grid de 8 servicios (naranja=servicios, rojo=emergencia)
    ├── PromoCarousel.tsx     ← banner horizontal con dots y onPress dinámico
    ├── FloatingFooter.tsx    ← 4 tarjetas flotantes sobre el mapa
    └── EmergencyModal.tsx    ← acción rápida: Policía / Hospital / Taxi emergencia
```

## Tokens de color (semántica estricta)

| Token | Hex | Uso permitido |
|---|---|---|
| `primary` | `#0066CC` | acciones principales, bordes, énfasis |
| `secondary` | `#C2410C` | servicios, estados activos, promos, avisos no críticos |
| `success` | `#1E7A45` | confirmaciones / pagos OK |
| `danger` | `#C62828` | SOLO emergencia/errores críticos |

Ningún componente hardcodea hexadecimales: todo se importa de
`constants/colors.ts` vía `useTheme()`. El modo oscuro NO usa negro puro
(`#17171A` base). Contraste WCAG AA pensado para sol directo y nocturno.
