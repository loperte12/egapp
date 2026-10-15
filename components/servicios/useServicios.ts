/**
 * useServicios — LA INTERACCIÓN de un servicio, una sola vez para toda la app
 * ============================================================================
 *
 * **Aquí está la lógica de negocio que había detrás de la rejilla de la Home** (`ServiceGrid`): qué
 * pasa al pulsar un servicio, con sus tres casos especiales, y el selector de perfil. Se sacó a un
 * módulo el 15/10/2026 **porque el Mercado pasa a enseñar los mismos servicios en su cabecera** y una
 * segunda copia de esto sería garantizar que un día las dos pantallas hagan cosas distintas:
 *
 *   · **Perfiles (RoleGate)**: hay servicios con más de un perfil (`constants/roles`, p. ej. taxi →
 *     pasajero o conductor). Si el usuario ya eligió uno, se va directo a su ruta; si no, se pregunta.
 *     Se recuerda por dispositivo (`state/rolePrefs`), y **mantener pulsado** vuelve a preguntar.
 *   · **Urgencia**: `tone === 'emergency'` **no navega**: abre el modal de emergencia, que lo pone la
 *     pantalla (`alAbrirEmergencia`). Es la diferencia entre «ir a una pantalla» y «avisar ahora».
 *   · **Próximamente**: una celda `comingSoon` está deshabilitada y no hace nada — y se dice.
 *   · **Navegación segura**: la ruta pasa por `constants/rutas`, que valida que exista. Así no se cuela
 *     una pantalla que ya no está (pasó con `/emergencia`, lo encontró `npm run rutas`).
 *
 * **El estado del selector vive aquí**, no en cada pantalla: el modal es el mismo y se pinta una vez.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';

import { SERVICES, type ServiceItem } from '../../constants/data';
import { roleOptionsFor, isRoleService, type RoleOption } from '../../constants/roles';
import { getSavedRole, saveRole } from '../../state/rolePrefs';
import { ir as irSeguro } from '../../constants/rutas';

export interface SolicitudDePerfil {
  servicio: ServiceItem;
  opciones: RoleOption[];
}

export function useServicios(alAbrirEmergencia: () => void) {
  const router = useRouter();
  const [eligiendo, setEligiendo] = useState<SolicitudDePerfil | null>(null);

  /** Los servicios por id, ya resueltos a partir de `constants/data`. */
  const porId = useMemo(() => new Map(SERVICES.map((s) => [s.id, s])), []);

  /** Navegación segura: si la ruta no existe, el ayudante lo explica en vez de no hacer nada. */
  const irA = useCallback((ruta: string) => irSeguro.libre(String(ruta ?? '')), []);

  const abrirOpciones = useCallback(async (servicio: ServiceItem) => {
    const opciones = roleOptionsFor(servicio.id);
    if (opciones.length <= 1) {
      if (opciones.length === 1) irA(opciones[0].route);
      return;
    }
    const guardado = await getSavedRole(servicio.id);
    const destino = opciones.find((o) => o.id === guardado);
    if (destino) irA(destino.route);
    else setEligiendo({ servicio, opciones });
  }, [irA]);

  /** Pulsar un servicio. **Los cuatro casos, en el mismo orden que en la Home.** */
  const prensar = useCallback((item: ServiceItem) => {
    if (item.comingSoon) return;
    if (item.tone === 'emergency') { alAbrirEmergencia(); return; }
    if (isRoleService(item.id)) { void abrirOpciones(item); return; }
    irA(item.route);
  }, [abrirOpciones, alAbrirEmergencia, irA]);

  /** Mantener pulsado: volver a preguntar el perfil (solo en servicios con perfiles). */
  const mantenerPulsado = useCallback((item: ServiceItem) => {
    if (!item.comingSoon && isRoleService(item.id)) void abrirOpciones(item);
  }, [abrirOpciones]);

  const elegirPerfil = useCallback((opcion: RoleOption) => {
    if (!eligiendo) return;
    const servicio = eligiendo.servicio;
    setEligiendo(null);
    void saveRole(servicio.id, opcion.id);
    router.push(opcion.route as never);
  }, [eligiendo, router]);

  return {
    /** El catálogo completo, tal cual lo declara `constants/data`. */
    servicios: SERVICES,
    porId,
    prensar,
    mantenerPulsado,
    irA,
    /** El servicio con perfiles: `true` si **hay que preguntar** (para el «mantén pulsado»). */
    tienePerfiles: isRoleService,
    eligiendo,
    elegirPerfil,
    cerrarSelector: () => setEligiendo(null),
  };
}

export default useServicios;
