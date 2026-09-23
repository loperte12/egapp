/**
 * agent.ts — cliente del AGENTE DE CAJA (panel nativo, parche 96 del servidor).
 *
 * El agente de caja mueve efectivo contra el monedero: recibe dinero del cliente
 * (CASH_IN) o le entrega dinero (CASH_OUT), y además hace RECADOS de compra
 * protegida (recoge del vendedor y entrega al comprador).
 *
 * Detalle que condiciona todo: el token de la app NO trae rol AGENT (los roles
 * de movilidad son DRIVER/PASSENGER/ADMIN; el rol de agente de caja lo emite el
 * login PIN del monedero). Por eso la autorización del panel va por IDENTIDAD y
 * los dos GET resuelven el perfil de agente por userId en el servidor.
 */
import { httpRequest } from './httpClient';
import { nuevaLlave } from './settlement';

export interface AgenteDeCaja {
  id: string;
  code: string;
  zone: string;
  status: string;
  dailyCashLimit: number;
}

export interface CargaDeAgente {
  cashIn: number;
  cashOut: number;
  pickups: number;
  deliveries: number;
}

export interface AgentePerfil {
  agent: AgenteDeCaja | null;
  pending: CargaDeAgente | null;
}

export interface OperacionDeEfectivo {
  id: string;
  type: 'CASH_IN' | 'CASH_OUT' | string;
  amount: number;
  currency: string;
  status: string;
  justification: string | null;
  expiresAt: string;
  createdAt: string;
  user: { name: string; phone: string };
}

export interface RecadoEscrow {
  id: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
  product: string | null;
  buyer: { name: string; phone: string };
  seller: { name: string; phone: string };
}

export interface CargaDeTrabajo {
  operations: OperacionDeEfectivo[];
  orders: RecadoEscrow[];
}

export const agentApi = {
  /** ¿Soy agente de caja? Perfil + cuánto tengo pendiente. */
  me: () => httpRequest<AgentePerfil>('/agent/me', { method: 'GET' }),

  /** Mi cola: efectivo por confirmar + recados en curso. */
  workload: () => httpRequest<CargaDeTrabajo>('/agent/workload', { method: 'GET' }),

  /** Confirmé que RECIBÍ el efectivo del cliente (el código se lo dio él). */
  confirmCashIn: (operationId: string, otp: string) =>
    httpRequest<{ operationId: string; balanceAvailable: number }>(
      `/agent/operations/${operationId}/confirm-cash-in`, { method: 'POST', body: { otp } },
    ),

  /** Confirmé que ENTREGUÉ el efectivo al cliente. */
  confirmCashOut: (operationId: string, otp: string) =>
    httpRequest<Record<string, unknown>>(
      `/agent/operations/${operationId}/confirm-cash-out`, { method: 'POST', body: { otp } },
    ),

  /** Recado: recogí el paquete del vendedor (QR que enseña el vendedor). */
  scanPickup: (orderId: string, qrToken: string) =>
    httpRequest<Record<string, unknown>>(`/escrow/orders/${orderId}/scan/pickup`, {
      method: 'POST', body: { qrToken }, headers: { 'Idempotency-Key': nuevaLlave('pickup') },
    }),

  /** Recado: entregué el paquete al comprador (QR que enseña el comprador).
   *  El servidor libera el dinero al vendedor en este paso. */
  scanDelivery: (orderId: string, qrToken: string) =>
    httpRequest<Record<string, unknown>>(`/escrow/orders/${orderId}/scan/delivery`, {
      method: 'POST', body: { qrToken }, headers: { 'Idempotency-Key': nuevaLlave('delivery') },
    }),
};
