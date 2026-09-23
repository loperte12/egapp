/**
 * wallet.ts — cliente NATIVO del monedero (P2, 17/09).
 *
 * Sustituye al WebView de la maqueta (que pintaba «María Nsue Obiang», una
 * tarjeta de agente fija MBO-0042 y un botón de ayuda a un teléfono chino).
 * Toda la información aquí es REAL y viene del backend del monedero (hk):
 *
 *   · GET    /wallet                      saldo disponible + en garantía + cupo de hoy
 *   · GET    /wallet/transactions         movimientos (paginación por cursor, filtro por tipo)
 *   · GET    /wallet/agents               agentes de efectivo ACTIVOS (parche 95)
 *   · POST   /auth/payment-token          PIN → token de pago (90 s, un solo uso, importe ligado)
 *   · POST   /wallet/deposits             inicia CASH_IN con agente (Idempotency-Key + token)
 *   · POST   /wallet/withdrawals          inicia CASH_OUT (además justificación AML ≥ 10 chars)
 *   · POST   /wallet/operations/:id/cancel  cancela una operación pendiente
 *   · POST   /wallet/pin                  fija/cambia el PIN (con la contraseña de la cuenta)
 *
 * Reglas del servidor que esta pantalla debe respetar:
 *   · Todo POST de dinero exige Idempotency-Key ÚNICA por intento (nuevaLlave()).
 *   · El token de pago va en X-Payment-Token y queda consumido al usarlo.
 *   · El flujo es en dos pasos: la app crea la operación → el usuario entrega/
 *     recibe el efectivo con el agente → el agente confirma con el OTP.
 *
 * Rails de dinero: hoy solo existe AGENTE DE EFECTIVO. La estructura de las
 * pantallas (elegir rail → importe → PIN) está pensada para añadir MUNI
 * DINERO como segundo rail sin rehacer nada (cooperación en conversación,
 * decisión del dueño 17/09).
 */

import { httpRequest } from './httpClient';
import { nuevaLlave } from './settlement';

export interface WalletBalance {
  balanceAvailable: number;
  balanceEscrow: number;
  currency: string;
  dailyLimit: number;
  today: {
    deposited?: number;
    withdrawn?: number;
    depositRemaining?: number;
    withdrawalRemaining?: number;
  };
}

export type WalletTxType =
  | 'DEPOSIT' | 'WITHDRAWAL' | 'ESCROW_LOCK' | 'ESCROW_RELEASE'
  | 'ESCROW_REFUND' | 'FEE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | string;

export interface WalletTx {
  id: string;
  type: WalletTxType;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string;
  amount: number;
  /** IN = entra a tu saldo, OUT = sale (lo manda el servidor; fíate de él). */
  direction?: 'IN' | 'OUT';
  currency?: string;
  counterpartyId?: string | null;
  fee?: number | null;
  referenceActivityId?: string | null;
  createdAt: string;
  completedAt?: string | null;
  failureReason?: string | null;
}

export interface WalletAgent {
  id: string;
  code: string;
  zone: string;
  name: string;
}

/** Operación de efectivo creada (el OTP se enseña al agente para que confirme). */
export interface CashOperation {
  operationId?: string;
  id?: string;
  otp?: string;
  fee?: number;
  status?: string;
  replay?: boolean;
  [k: string]: unknown;
}

export const walletApi = {
  /** Saldo + cupo diario. */
  getWallet: () => httpRequest<WalletBalance>('/wallet', { method: 'GET' }),

  /** Movimientos, más nuevos primero; `cursor` del campo nextCursor de la página anterior. */
  listTransactions: (cursor?: string, type?: string, limit = 25) => {
    const q = new URLSearchParams();
    if (cursor) q.set('cursor', cursor);
    if (type) q.set('type', type);
    q.set('limit', String(limit));
    const qs = q.toString();
    return httpRequest<{ items: WalletTx[]; nextCursor?: string | null }>(
      `/wallet/transactions${qs ? `?${qs}` : ''}`, { method: 'GET' },
    );
  },

  /** Agentes de efectivo activos (parche 95). */
  listAgents: () => httpRequest<{ items: WalletAgent[] }>('/wallet/agents', { method: 'GET' }),

  /** PIN → token de pago de un solo uso.
   *  scope: DEPOSIT | WITHDRAWAL (efectivo con agente) y ESCROW_LOCK (compras: el dinero
   *  del pedido queda en garantía hasta que el comprador recibe). */
  paymentToken: async (
    pin: string,
    scope: 'DEPOSIT' | 'WITHDRAWAL' | 'ESCROW_LOCK',
    amount: number,
  ): Promise<string> => {
    const r = await httpRequest<{ paymentToken?: string }>('/auth/payment-token', {
      method: 'POST',
      body: { method: 'PIN', pin, scope, amount },
    });
    if (!r?.paymentToken) throw new Error('PIN incorrecto o bloqueado');
    return r.paymentToken;
  },

  /** Inicia un depósito en efectivo con el agente elegido. */
  requestDeposit: (amount: number, agentId: string, paymentToken: string) =>
    httpRequest<CashOperation>('/wallet/deposits', {
      method: 'POST',
      body: { amount, agentId },
      headers: { 'Idempotency-Key': nuevaLlave('dep'), 'X-Payment-Token': paymentToken },
    }),

  /** Inicia una retirada en efectivo (justificación AML obligatoria). */
  requestWithdrawal: (amount: number, agentId: string, justification: string, paymentToken: string) =>
    httpRequest<CashOperation>('/wallet/withdrawals', {
      method: 'POST',
      body: { amount, agentId, justification },
      headers: { 'Idempotency-Key': nuevaLlave('ret'), 'X-Payment-Token': paymentToken },
    }),

  /** Cancela una operación pendiente (antes de que el agente confirme). */
  cancelOperation: (operationId: string) =>
    httpRequest<{ ok?: boolean }>(`/wallet/operations/${operationId}/cancel`, {
      method: 'POST', body: {}, headers: { 'Idempotency-Key': nuevaLlave('cancel-op') },
    }),
};
