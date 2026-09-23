/**
 * Cliente KYC — app React Native.
 * Consume /v1/mobility/kyc/* siguiendo el contrato de @egrouteplan/contracts
 * y el flujo probado en kyc-gate-e2e.mjs.
 * Usa httpClient (sesión inyectada + refresco 401 silencioso).
 */

import { http, ApiError } from './httpClient';
import {
  type StartSubmissionRequest,
  type StartSubmissionResponse,
  type PresignDocRequest,
  type PresignDocResponse,
  type CompleteDocRequest,
  type LivenessChallenge,
  type BiometryVerifyRequest,
  type BiometryResult,
  type KycStatus,
  KYC_TERMINAL_STATUSES,
} from '@egrouteplan/contracts';
import { sha256 } from 'js-sha256';

export type { KycStatus };
export { ApiError, KYC_TERMINAL_STATUSES };

export interface SubmissionState {
  submissionId: string;
  status: KycStatus;
  riskScore: number | null;
  riskFlags: string[];
  faceMatchScore: number | null;
  livenessScore: number | null;
  decision: StartSubmissionResponse['decision'];
}

/** Decodifica base64 (de la cámara) a bytes crudos para subir y hashear. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** SHA-256 en hex de un Uint8Array (bytes de la imagen). */
export function hashBytes(bytes: Uint8Array): string {
  return sha256.update(bytes).hex();
}

export const kycApi = {
  /** Última submission del usuario (null si nunca inició KYC). */
  current: () => http.get<SubmissionState | null>('/mobility/kyc/submissions/me', true),

  /** Inicia una nueva submission (idempotente por idempotencyKey). */
  start: (body: StartSubmissionRequest) =>
    http.post<StartSubmissionResponse & { replay?: boolean }>('/mobility/kyc/submissions', body, true),

  /** Estado completo de una submission. */
  get: (id: string) => http.get<SubmissionState>(`/mobility/kyc/submissions/${id}`, true),

  /** Obtiene URL prefirmada para subir una pieza documental directamente a MinIO. */
  presign: (submissionId: string, body: PresignDocRequest) =>
    http.post<PresignDocResponse>(`/mobility/kyc/submissions/${submissionId}/documents/presign`, body, true),

  /** Sube bytes a la URL prefirmada (PUT directo al storage). */
  uploadToPresignedUrl: async (uploadUrl: string, bytes: Uint8Array, mime: string, extraHeaders: Record<string, string>) => {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mime,
        'Content-Length': String(bytes.length),
        ...extraHeaders,
      },
      body: new Blob([bytes], { type: mime }) as any,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      throw new ApiError('UPLOAD_FAILED', `No se pudo subir el archivo: ${text.slice(0, 120)}`);
    }
  },

  /** Notifica al backend que la pieza ya está en storage y encola OCR. */
  completeDocument: (submissionId: string, body: CompleteDocRequest) =>
    http.post<{ documentId: string; ocrStatus: string }>(
      `/mobility/kyc/submissions/${submissionId}/documents/complete`,
      body,
      true,
    ),

  /** Crea un desafío de liveness firmado. */
  createChallenge: (submissionId: string) =>
    http.post<LivenessChallenge>(`/mobility/kyc/submissions/${submissionId}/biometrics/challenge`, undefined, true),

  /** Envía frames para verificación de liveness y encadena scoring/AML. */
  verifyBiometry: (submissionId: string, body: BiometryVerifyRequest) =>
    http.post<BiometryResult>(`/mobility/kyc/submissions/${submissionId}/biometrics/verify`, body, true),
};
