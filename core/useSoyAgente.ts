/**
 * useSoyAgente — ¿ESTA CUENTA ES AGENTE DE CAJA? (una sola fuente de verdad)
 *
 * Igual que `useMisNegocios` para los comerciantes, esto decide el acceso al
 * panel del agente y sale en DOS sitios (el cajón de servicios ☰ y el perfil). Si
 * cada pantalla lo detectara por su cuenta, en dos semanas una lo sabría y la otra
 * no.
 *
 * Decisiones que no son obvias:
 *  · **Se pregunta al SERVIDOR, no al token**: el JWT de la app lleva roles de
 *    movilidad (DRIVER/PASSENGER/ADMIN) y NUNCA trae AGENT — el rol de agente de
 *    caja solo lo emite el login PIN del monedero. El backend resuelve el perfil
 *    por userId (`GET /v1/agent/me`, parche 96).
 *  · **Un fallo se traduce en «no es agente»**, nunca en una pantalla rota: si el
 *    servicio no contesta, el panel simplemente no aparece.
 *  · Devuelve también la CARGA pendiente, para que la fila del menú pueda decir
 *    cuánto trabajo hay esperando sin abrir nada.
 */
import { useEffect, useRef, useState } from 'react';
import { agentApi, type AgenteDeCaja, type CargaDeAgente } from '../api/agent';

export function useSoyAgente(cuenta?: string | null): {
  agente: AgenteDeCaja | null;
  pendiente: CargaDeAgente | null;
  cargando: boolean;
} {
  const [agente, setAgente] = useState<AgenteDeCaja | null>(null);
  const [pendiente, setPendiente] = useState<CargaDeAgente | null>(null);
  const [cargando, setCargando] = useState(true);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    setCargando(true);
    void (async () => {
      try {
        const r = await agentApi.me();
        if (!vivo.current) return;
        const activo = r?.agent && String(r.agent.status) === 'ACTIVE' ? r.agent : null;
        setAgente(activo);
        setPendiente(activo ? r.pending ?? null : null);
      } catch {
        if (vivo.current) { setAgente(null); setPendiente(null); }
      } finally {
        if (vivo.current) setCargando(false);
      }
    })();
    return () => { vivo.current = false; };
  }, [cuenta]);

  return { agente, pendiente, cargando };
}
