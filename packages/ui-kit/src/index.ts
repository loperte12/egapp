/**
 * @egrouteplan/ui-kit — barrel export del Design System interno.
 * Todos los módulos (movilidad, KYC, monedero, futuros) importan de aquí.
 */

// Tema y tokens
export {
  brand,
  lightColors,
  darkColors,
  alpha,
  neutro,
  elevation,
  elevationDark,
  type ThemeColors,
  type AcentoTexto,
  type ElevationStyle,
} from './theme/colors';
export { ThemeProvider, useTheme, type ThemeMode } from './theme/ThemeContext';
export {
  tipografia,
  interlineado,
  peso,
  espaciado,
  radios,
  trazo,
  trazoIcono,
  altura,
  icono,
  ilustracion,
  type TamanoTexto,
  type Interlineado,
  type Espaciado,
  type Radio,
  type Trazo,
  type TrazoIcono,
  type Altura,
  type Icono,
  type Ilustracion,
} from './theme/escalas';

/* Movimiento. Va en su propio fichero y no dentro de `escalas.ts` por el mismo criterio que declara
   `escalas.ts:13`: aquel son escalas de TAMAÑO; esto son tiempos y curvas, y se leen distinto. */
export {
  duracion,
  curva,
  opacidad,
  umbral,
  resorte,
  repeticion,
  type Duracion,
  type Curva,
  type Opacidad,
  type Umbral,
  type Resorte,
} from './theme/movimiento';

// Accesibilidad
export { useMovimientoReducido } from './a11y/useMovimientoReducido';

// Formato
export {
  formateaXAF,
  partesXAF,
  ESPACIO_DURO,
  MONEDA_XAF,
  SIN_IMPORTE,
  type PartesMoneda,
} from './format/moneda';

// Seguridad
export { useScreenGuard } from './security/useScreenGuard';

// Primitivos
export { FormField } from './primitives/FormField';
export { OtpInput } from './primitives/OtpInput';
export { PinSheet, type PinSheetProps } from './primitives/PinSheet';
export { Sheet, type SheetProps } from './primitives/Sheet';
export { InlineError, type InlineErrorProps } from './primitives/InlineError';
export { Aviso, useAviso, type AvisoProps, type TonoAviso } from './primitives/Aviso';
export { EmptyState, type EmptyStateProps } from './primitives/EmptyState';
export { MasOpciones, type MasOpcionesProps } from './primitives/MasOpciones';
export { haptico, type TipoHaptico } from './feedback/hapticos';
export { anunciar } from './feedback/anuncios';
export { StepHeader, type StepState } from './primitives/StepHeader';
/* `ScreenHeader` NO es `StepHeader`: aquel es la cabecera de un paso de flujo (barra de progreso
   segmentada, sin volver), y este es la fila de pantalla con volver, título y acción. Se llaman
   distinto a propósito, aunque Bernardo pidió el nombre `StepHeader`: ese nombre ya estaba tomado
   por el de KYC (5 pantallas lo importan), y dos componentes distintos con el mismo nombre en el
   mismo barrel es un error de importación esperando a ocurrir. */
export { ScreenHeader, type ScreenHeaderProps } from './primitives/ScreenHeader';
export { PrimaryButton, GhostButton } from './primitives/PrimaryButton';
export { Tactil, type TactilProps } from './primitives/Tactil';
export { DocumentChoiceTree, type DocOptionItem } from './primitives/DocumentChoiceTree';
export { KycStatusBanner } from './primitives/KycStatusBanner';
export { CameraCapture, type CaptureVariant } from './primitives/CameraCapture';
export { LivenessChallengeView, type LivenessMethodT } from './primitives/LivenessChallengeView';
export { EstadoDinero, type EstadoDineroProps, type EtapaDinero } from './primitives/EstadoDinero';
export {
  Precio,
  type PrecioProps,
  type PrecioTamano,
  type PrecioForma,
} from './primitives/Precio';

/* Micro-interacciones. Ver `micro/index.ts` para qué sustituye cada una y cuáles NO se portan. */
export * from './micro';
