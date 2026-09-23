# @egrouteplan/ui-kit — Design System interno de EG Route Plan

**Única fuente de verdad** de tokens, tema y primitivos de seguridad para todos
los módulos de la super-app (movilidad · KYC · monedero · futuros: crédito,
seguros, inversiones). Paquete **privado** del workspace (`workspace:*`) —
no se publica a npm.

## Qué exporta

| Export | Descripción |
|---|---|
| `brand`, `lightColors`, `darkColors`, `alpha`, `ThemeColors` | Tokens de color (semántica estricta: azul=acción, naranja=servicio, verde=éxito, rojo=solo emergencia) |
| `ThemeProvider`, `useTheme`, `ThemeMode` | Tema claro/oscuro (sistema + override) |
| `FormField` | Input con foco azul, error rojo en 1 línea, icono opcional |
| `OtpInput` | 6 celdas con auto-avance, accesible, error integrado |
| `PinPad` | Teclado PIN con **prevención de capturas integrada** (`useScreenGuard` se activa solo mientras el pad está montado) |
| `StepHeader` | Cabecera de paso + barra de progreso segmentada azul |
| `PrimaryButton`, `GhostButton` | CTA único azul / acción secundaria sin relleno |
| `useScreenGuard` | Hook de seguridad: FLAG_SECURE (Android) + protección iOS vía `expo-screen-capture` |

## Regla de oro

Los equipos de producto **no crean sus propios inputs/PIN/OTP**: se consume
del kit. Cualquier mejora de seguridad (p. ej. detección de grabación de
pantalla) se aplica una vez aquí y llega a todos los módulos.

## Uso

```tsx
import { PinPad, FormField, useTheme } from '@egrouteplan/ui-kit';
```
