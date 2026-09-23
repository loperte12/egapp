/**
 * Cliente del módulo Billing/Payments Core — backend unificado.
 * Base ABSOLUTA: /api/billing/*. Manual-first: orden → comprobante →
 * admin aprueba → entitlement.
 */

import { http, httpRequest } from './httpClient';

import { API_HOST } from './config';
export const BILLING_API = `${API_HOST}/api`;
const b = (p: string) => `${BILLING_API}${p}`;

export interface BillingPlan {
  id: string; module: string; code: string; name: string; description: string | null;
  priceXaf: number; currency: string; interval: string | null; durationDays: number;
  features: Record<string, unknown>; paymentInstructions: string | null; active: boolean;
}

export interface BillingOrder {
  id: string; planId: string; planCode: string; planName: string;
  paymentInstructions: string | null;
  module: string; targetType: string; targetId: string | null;
  amountXaf: number; planPrice: number; currency: string;
  status: string; paymentMethod: string | null; rejectionReason: string | null;
  expiresAt: string | null; createdAt: string;
  refundStatus?: string | null; cancellationReason?: string | null; reversalReason?: string | null;
  proofs: Array<{ id: string; fileType: string; fileSize: number; declaredAmountXaf: number | null; declaredReference: string | null; createdAt: string }>;
}

export interface BillingEntitlement {
  id: string; module: string; code: string; targetType: string; targetId: string | null;
  startsAt: string; expiresAt: string | null; status: string; active: boolean;
  expiringSoonAt?: string | null; graceUntil?: string | null;
  syncStatus?: string; lastSyncError?: string | null; daysLeft?: number | null;
}

export const billingApi = {
  plans: (module?: string) => http.get<BillingPlan[]>(b(`/billing/plans${module ? '?module=' + module : ''}`), false),
  createOrder: (body: { planId: string; targetType?: string; targetId?: string }) =>
    http.post<{ message: string; order?: BillingOrder; orderId?: string }>(b('/billing/orders'), body, true),
  order: (id: string) => http.get<BillingOrder>(b(`/billing/orders/${id}`), true),
  myOrders: () => http.get<Array<{ id: string; planCode: string; planName: string; amountXaf: number; status: string; createdAt: string; rejectionReason: string | null; refundStatus?: string | null; cancellationReason?: string | null; reversalReason?: string | null }>>(b('/billing/orders'), true),
  /** Comprobante de pago como ARCHIVO (multipart): jpg/png/pdf, máx 5 MB. */
  submitProof: (id: string, form: FormData) =>
    httpRequest<{ message: string; status: string }>(b(`/billing/orders/${id}/proof`), { method: 'POST', auth: true, form }),
  myEntitlements: () => http.get<BillingEntitlement[]>(b('/billing/entitlements/me'), true),
  cancelOrder: (id: string, reason: string) =>
    http.post<{ message: string; order?: BillingOrder }>(b(`/billing/orders/${id}/cancel`), { reason }, true),
  settleCommissions: () =>
    http.post<{ message: string; orderId?: string }>(b('/billing/commissions/settle'), {}, true),
};
