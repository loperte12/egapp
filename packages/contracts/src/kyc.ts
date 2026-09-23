/**
 * CONTRATOS KYC — única fuente de verdad compartida (app RN ↔ backend).
 * Cualquier cambio aquí es breaking-change contractual: versionar con cuidado.
 */

// ---------------------------------------------------------------------------
// FSM — estados y transiciones válidas (Pilar 2)
// ---------------------------------------------------------------------------

export const KYC_STATUSES = [
  'INITIATED', 'OCR_PENDING', 'OCR_FAILED',
  'LIVENESS_REQUIRED', 'LIVENESS_FAILED',
  'AML_CHECK', 'MANUAL_REVIEW',
  'APPROVED_L1', 'APPROVED_L2', 'REJECTED', 'EXPIRED',
] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const KYC_TERMINAL_STATUSES: readonly KycStatus[] = ['APPROVED_L1', 'APPROVED_L2', 'REJECTED', 'EXPIRED'];

/** Mapa de transiciones permitidas (el backend lo valida; la app lo usa para el StepHeader). */
export const KYC_TRANSITIONS: Readonly<Record<KycStatus, readonly KycStatus[]>> = {
  INITIATED: ['OCR_PENDING'],
  OCR_PENDING: ['LIVENESS_REQUIRED', 'OCR_FAILED'],
  OCR_FAILED: ['OCR_PENDING', 'REJECTED'],
  LIVENESS_REQUIRED: ['AML_CHECK', 'LIVENESS_FAILED', 'MANUAL_REVIEW'],
  LIVENESS_FAILED: ['LIVENESS_REQUIRED', 'MANUAL_REVIEW', 'REJECTED'],
  AML_CHECK: ['APPROVED_L1', 'APPROVED_L2', 'MANUAL_REVIEW', 'REJECTED'],
  MANUAL_REVIEW: ['APPROVED_L1', 'APPROVED_L2', 'REJECTED'],
  APPROVED_L1: ['EXPIRED'],
  APPROVED_L2: ['EXPIRED'],
  REJECTED: [],
  EXPIRED: ['INITIATED'],
} as const;

export function canTransition(from: KycStatus, to: KycStatus): boolean {
  return KYC_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Documentos y vía documental (árbol de decisión server-driven — Pilar 3)
// ---------------------------------------------------------------------------

export const KYC_DOC_TYPES = ['DIP', 'PASSPORT', 'RESIDENCE_CARD', 'SCHOOL_ID', 'TUTOR_DIP'] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];

export const KYC_DOC_SIDES = ['front', 'back', 'selfie', 'photo_id'] as const;
export type KycDocSide = (typeof KYC_DOC_SIDES)[number];

export type KycNationalityPath = 'NATIONAL_ADULT' | 'FOREIGN_ADULT' | 'MINOR' | 'NOT_ELIGIBLE';

export interface KycDocOption {
  docType: KycDocType;
  sides: KycDocSide[];
  title: string;        // ≤ 5 palabras para DocumentChoiceTree
  subtitle: string;     // 1 línea
}

export interface KycDecisionResult {
  path: KycNationalityPath;
  isMinor: boolean;
  targetLevel: 1 | 2;
  options: KycDocOption[];
  requiresTutor: boolean;
  requiresLiveness: boolean;
}

// ---------------------------------------------------------------------------
// API DTOs
// ---------------------------------------------------------------------------

export interface StartSubmissionRequest {
  fullName: string;
  birthDate: string;   // ISO date
  nationality: string; // ISO-3166 alpha-2
  idempotencyKey: string;
}

export interface StartSubmissionResponse {
  submissionId: string;
  status: KycStatus;
  decision: KycDecisionResult;
}

export interface PresignDocRequest {
  docType: KycDocType;
  side: KycDocSide;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: number;
  sha256: string;
}

export interface PresignDocResponse {
  uploadUrl: string;
  headers: Record<string, string>;
  storageKey: string;
  expiresIn: number; // segundos
}

export interface CompleteDocRequest {
  storageKey: string;
  sha256: string;
  docType: KycDocType;
  side: KycDocSide;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: number;
}

export const LIVENESS_METHODS = ['BLINK', 'TURN', 'READ_DIGITS'] as const;
export type LivenessMethod = (typeof LIVENESS_METHODS)[number];

export interface LivenessChallenge {
  challengeId: string;
  method: LivenessMethod;
  actions: string[];     // p. ej. ['BLINK_X2', 'TURN_LEFT'] o dígitos ['4','8','1','9']
  expiresIn: number;     // 90 s
  sessionSignature: string; // HMAC anti camera-injection
}

export interface BiometryVerifyRequest {
  challengeId: string;
  sessionSignature: string; // HMAC anti-replay entregado con el challenge
  framesSha256: string[];
  captureTimestamps: number[]; // monótonos del dispositivo
  deviceSignal?: DeviceSignalPayload;
}

export interface BiometryResult {
  livenessScore: number;
  faceMatchScore: number;
  antiSpoofFlags: string[];
  nextStatus: KycStatus;
}

// ---------------------------------------------------------------------------
// Riesgo y AML (Pilar 4)
// ---------------------------------------------------------------------------

export interface DeviceSignalPayload {
  deviceId: string;
  platform: 'ios' | 'android';
  osVersion: string;
  model: string;
  gpsLat?: number;
  gpsLng?: number;
  isRooted?: boolean;
  isEmulator?: boolean;
}

export const RISK_FLAGS = [
  'EMULATOR', 'ROOTED', 'MULTI_ACCOUNT_DEVICE', 'GEO_MISMATCH',
  'FACE_MATCH_LOW', 'VIRTUAL_CAMERA_SUSPECT', 'PEP_HIT', 'SANCTIONS_HIT',
] as const;
export type RiskFlag = (typeof RISK_FLAGS)[number];

export interface RiskDecision {
  riskScore: number;              // 0–100
  flags: RiskFlag[];
  walletDailyLimit: number;       // XAF
  withdrawalAllowed: boolean;
  forcedManualReview: boolean;
}

/** Matriz de riesgo → límites del monedero (contrato Fase C). */
export function riskToWalletLimits(riskScore: number): Omit<RiskDecision, 'flags'> {
  if (riskScore >= 80) return { walletDailyLimit: 0, withdrawalAllowed: false, forcedManualReview: true, riskScore };
  if (riskScore >= 60) return { walletDailyLimit: 20_000, withdrawalAllowed: false, forcedManualReview: true, riskScore };
  if (riskScore >= 30) return { walletDailyLimit: 50_000, withdrawalAllowed: false, forcedManualReview: false, riskScore };
  return { walletDailyLimit: 100_000, withdrawalAllowed: true, forcedManualReview: false, riskScore };
}

// ---------------------------------------------------------------------------
// Eventos SSE (StepHeader en tiempo real — Pilar 2.4)
// ---------------------------------------------------------------------------

export interface KycStatusEvent {
  type: 'status' | 'document.ocr' | 'biometry.score' | 'aml.score' | 'review.note';
  submissionId: string;
  from?: KycStatus;
  to?: KycStatus;
  stepIndex: number;      // 1-based para el StepHeader del ui-kit
  stepTotal: number;
  label: string;          // texto humano ≤ 6 palabras
  at: string;             // ISO timestamp
}

/** Mapeo estado → índice de paso visual para la app. */
export const KYC_STATUS_TO_STEP: Readonly<Record<KycStatus, { index: number; total: number; label: string }>> = {
  INITIATED: { index: 1, total: 5, label: 'Datos personales' },
  OCR_PENDING: { index: 2, total: 5, label: 'Leyendo documento' },
  OCR_FAILED: { index: 2, total: 5, label: 'Documento ilegible' },
  LIVENESS_REQUIRED: { index: 3, total: 5, label: 'Prueba de vida' },
  LIVENESS_FAILED: { index: 3, total: 5, label: 'Prueba fallida' },
  AML_CHECK: { index: 4, total: 5, label: 'Verificación de seguridad' },
  MANUAL_REVIEW: { index: 4, total: 5, label: 'Revisión en curso' },
  APPROVED_L1: { index: 5, total: 5, label: 'Verificado' },
  APPROVED_L2: { index: 5, total: 5, label: 'Verificado' },
  REJECTED: { index: 5, total: 5, label: 'No verificado' },
  EXPIRED: { index: 5, total: 5, label: 'Documento vencido' },
} as const;

// ---------------------------------------------------------------------------
// Webhooks (Pilar 2.3)
// ---------------------------------------------------------------------------

export interface WebhookAck {
  received: boolean;
  deduped?: boolean;
}

export interface ProviderOcrWebhookPayload {
  externalId: string;
  submissionId: string;
  docType: KycDocType;
  side: KycDocSide;
  ok: boolean;
  confidence?: number;
  fields?: Record<string, string>;
  error?: string;
}
