/**
 * ServicesDrawer — panel lateral derecho (estilo Xiaohongshu) con los servicios
 * y herramientas de EG Route Plan. Se abre desde el ☰ del Perfil.
 *
 * Secciones: Servicios · Comercio y creador · Cuenta y actividad · Soporte.
 * "Ajustes" va FIJO al pie y abre la página independiente /settings.
 * Los ítems sin backend todavía muestran badge "Próximamente" (Alert honesto).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, X, type LucideIcon } from 'lucide-react-native';
import {
  BadgeCheck, BedDouble, Briefcase, CalendarDays, CarTaxiFront, Clapperboard, Clock, Download,
  FileQuestion, Handshake, Headset, HelpCircle, History, KeyRound, LayoutGrid, Package, Route,
  ScanLine, Settings, ShoppingBag, ShoppingCart, Siren, Sparkles, StickyNote, Store,
  Ticket, UserCog, UserPlus, UserRound, Utensils, UtensilsCrossed, Wallet, Wrench,
} from 'lucide-react-native';
import { alpha, elevation, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { absUrl } from '../api/config';
import { useMisNegocios, type VerticalNegocio } from '../core/useMisNegocios';
import { useSoyAgente } from '../core/useSoyAgente';
import { destinoMiPerfilLifeBook } from '../core/miPerfil';
import { ir as irSeguro } from '../constants/rutas';

/**
 * Icono de cada vertical en el menú.
 *
 * El hook devuelve el `vertical`, no el icono (es un `.ts`, sin JSX): cada pantalla lo pinta.
 * Aquí no se usa el helper del perfil a propósito — el perfil no es un sitio del que un
 * componente del kit deba depender.
 */
function iconoDeVerticalDrawer(v: VerticalNegocio): LucideIcon {
  switch (v) {
    case 'hotel': return requireIcon('BedDouble');
    case 'restaurante': return requireIcon('UtensilsCrossed');
    case 'trabajo': return requireIcon('Briefcase');
    case 'mercado':
    default: return requireIcon('Store');
  }
}

type Item = { icon: LucideIcon; label: string; route?: string; soon?: boolean; action?: () => void };

interface ServicesDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** Nombre y avatar del usuario (cabecera compacta). */
  userName: string;
  userAvatar?: string | null;
  roleLabel: string;
  role?: 'PASSENGER' | 'DRIVER' | 'ADMIN';
  onEmergency: () => void;
  /**
   * Identificador de la cuenta: con él se averigua QUÉ NEGOCIOS tiene (`useMisNegocios`).
   * Sin él, el bloque «Tus negocios» simplemente no aparece — el menú sigue funcionando.
   */
  cuenta?: string | null;
}

const DRAWER_W = 318;

export default function ServicesDrawer({ visible, onClose, userName, userAvatar, roleLabel, role, onEmergency, cuenta }: ServicesDrawerProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  /** Divulgación progresiva del grupo «Servicios» (auditoría de diseño, Fase 1). */
  const [verTodos, setVerTodos] = useState(false);
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  /**
   * ══ TUS NEGOCIOS ══  (el hook va AQUÍ, arriba, y no más abajo)
   *
   * 🔴 Esto ya se rompió una vez: la primera versión lo llamaba DESPUÉS de
   * `if (!mounted) return null`. Al no estar montado el hook no se ejecutaba, y al montarse el
   * menú se ejecutaba uno más que en el render anterior → React aborta con
   * **«Rendered more hooks than during the previous render»** y la app se cae al abrir el menú.
   * Lo cazó el CrashShield en el aparato.
   *
   * Regla que se deduce: **ningún hook después de un `return` temprano.** Los hooks primero,
   * siempre, y las salidas después.
   *
   * La detección vive en `core/useMisNegocios` — la MISMA que usa el bloque del perfil, para
   * que las dos no se separen. El estándar: `ESTANDAR-ENTORNOS-DE-CONTROL.md`.
   */
  const { negocios } = useMisNegocios(cuenta);
  const tieneNegocio = (negocios?.length ?? 0) > 0;
  // ¿Agente de caja? Se pregunta al servidor (el token de la app nunca trae rol
  // AGENT). El hook va AQUÍ arriba, con los demás: ningún hook después de un
  // `return` temprano — regla que ya costó una caída de la app (ver nota de abajo).
  const { agente, pendiente } = useSoyAgente(cuenta);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, anim]);

  if (!mounted) return null;

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [DRAWER_W + 40, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const go = (route?: string) => {
    onClose();
    if (route) router.push(route as any);
  };
  const soon = () => Alert.alert('Próximamente', 'Esta función llegará en una próxima actualización.');

  /** Grupo «Tus negocios», arriba del todo del menú (los hooks ya se llamaron más arriba). */
  const renderNegocios = () => {
    if (!negocios?.length) return null;
    return (
      <View key="negocios">
        <Text style={[styles.groupTitle, { color: colors.secondary }]}>
          {negocios.length > 2 ? `TUS NEGOCIOS (${negocios.length})` : 'TU NEGOCIO'}
        </Text>
        <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: alpha(colors.secondary, 0.35), borderWidth: trazo.fino }]}>
          {negocios.map((n, i) => {
            const Icon = iconoDeVerticalDrawer(n.vertical);
            return (
              <Pressable
                key={n.clave}
                onPress={() => go(n.ruta)}
                style={({ pressed }) => [
                  styles.row,
                  { minHeight: 56, backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' },
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${n.titulo}. ${n.detalle}${n.nota ? ` ${n.nota}` : ''}`}
              >
                <View style={[styles.rowIcon, { backgroundColor: alpha(colors.secondary, 0.12) }]}>
                  <Icon size={18} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }} numberOfLines={2}>
                    {n.titulo}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }} numberOfLines={2}>
                    {n.detalle}
                  </Text>
                  {n.nota ? (
                    <Text style={{ color: colors.secondary, fontSize: tipografia.micro, fontWeight: peso.fuerte, marginTop: espaciado.e2 }} numberOfLines={2}>
                      {n.nota}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight size={16} color={colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const S1: Item[] = [
    { icon: requireIcon('Ticket'), label: 'Mis tickets', route: '/my-tickets' },
    { icon: requireIcon('StickyNote'), label: 'Mi estado 24h', route: '/status' },
    { icon: requireIcon('Briefcase'), label: 'Buscar Work', route: '/work' },
    { icon: requireIcon('ShoppingBag'), label: 'Ecomerse', route: '/ecomerse' },
    { icon: requireIcon('Utensils'), label: 'Comida Rápida', route: '/food' },
    { icon: requireIcon('Route'), label: 'Ciudad a Ciudad', route: '/intercity' },
    { icon: requireIcon('CarTaxiFront'), label: 'Llamar Taxi', route: '/taxi' },
    { icon: requireIcon('History'), label: 'Historial taxi', route: '/trips-history' },
    { icon: requireIcon('KeyRound'), label: 'Alquiler', route: '/alquiler' },
    { icon: requireIcon('Wallet'), label: 'Monedero', route: '/monedero' },
  ];
  // Conductor: acceso directo a su modo conductor / perfil (no se pierde al
  // quitar los servicios del cuerpo del perfil).
  if (role === 'DRIVER') {
    S1.push({ icon: requireIcon('CarTaxiFront'), label: 'Centro de conductor', route: '/conductor' });
    S1.push({ icon: requireIcon('UserCog'), label: 'Perfil conductor', route: '/driver-profile' });
  }
  /**
   * AGENTE DE CAJA: la fila aparece SOLO si el servidor dice que esta cuenta tiene
   * perfil de agente ACTIVE (`GET /v1/agent/me`, parche 96). El rol del token no
   * sirve para decidirlo: los JWT de la app son DRIVER/PASSENGER/ADMIN y nunca
   * traen AGENT. El texto lleva el trabajo pendiente, para no abrir a ciegas.
   */
  if (agente) {
    const trabajo = pendiente
      ? (pendiente.cashIn ?? 0) + (pendiente.cashOut ?? 0) + (pendiente.pickups ?? 0) + (pendiente.deliveries ?? 0)
      : 0;
    S1.push({
      icon: requireIcon('Wallet'),
      label: trabajo > 0 ? `Panel de agente (${trabajo})` : 'Panel de agente',
      route: '/agente',
    });
  }

  /**
   * DIVULGACIÓN PROGRESIVA (auditoría de diseño, Fase 1 · punto 1.13).
   *
   * El grupo «Servicios» llegaba a trece filas y los cuatro servicios que la gente usa a diario
   * (taxi, comida, monedero, mercado) estaban repartidos por el medio: había que recorrer la lista
   * entera para llegar a lo de todos los días. Ahora esos cuatro van siempre a la vista y el resto
   * espera detrás de un botón que dice cuántos quedan.
   *
   * Las filas de ROL (centro de conductor, perfil conductor, panel de agente) NO se esconden
   * nunca: quien las tiene las tiene por su trabajo, no por curiosidad, y esconderlas sería
   * quitarle a un conductor su herramienta para reducir una lista.
   */
  const SIEMPRE_VISIBLES = new Set(['/taxi', '/food', '/monedero', '/ecomerse', '/conductor', '/driver-profile', '/agente']);
  // Una fila sin `route` (acción en línea) no se esconde nunca: no sabemos si es de las de diario.
  const visibles = verTodos ? S1 : S1.filter((i) => !i.route || SIEMPRE_VISIBLES.has(i.route));
  const ocultos = S1.filter((i) => !!i.route && !SIEMPRE_VISIBLES.has(i.route));

  /**
   * «Mi perfil de Life Book» va EN SU PROPIO GRUPO, EL PRIMERO DEL MENÚ.
   *
   * Estaba enterrado y se midió en el aparato: primero hay que pasar «TUS NEGOCIOS (4)» —cuatro
   * filas con su nota— y los diez servicios del grupo «Servicios», porque el orden de render es
   * negocios → servicios → comercio. O sea **dos desplazamientos** para llegar a una puerta que
   * el dueño pedía precisamente porque no se encontraba. Una puerta que no se ve no es una puerta.
   *
   * Abre el perfil PÚBLICO —el que ven los demás— con EL MISMO destino que el avatar de la barra
   * de Life Book: las dos salen de `core/miPerfil`, para que no puedan separarse.
   * Se llama «de Life Book» a propósito: la pestaña «Perfil» del dock lleva al perfil de CUENTA
   * (`/profile`, identidad + negocios), y dos cosas distintas no pueden llamarse igual.
   *
   * El grupo se titula «TU CUENTA» y no repite el nombre de la fila para no quedar redundante.
   */
  const S0: Item[] = [
    {
      icon: requireIcon('UserRound'),
      label: 'Mi perfil de Life Book',
      action: () => {
        onClose();
        const destino = destinoMiPerfilLifeBook(cuenta);
        /* NAVEGACIÓN SEGURA: si no se puede resolver el destino (sesión a medias), antes la
           pulsación no hacía nada. Ahora se explica en vez de dejar el botón mudo. */
        irSeguro.destino(destino, 'No se pudo leer tu perfil de Life Book.');
      },
    },
  ];

  const S2: Item[] = [
    // «Abrir tienda» apuntaba a `/ecomerse-seller`, que es la pantalla VIEJA de comercio: el
    // publicador real de Life Book es `/lifebook-sell` (producto, comida, servicio o alquiler).
    // Y los seis «Próximamente» que había aquí ya no lo son: publicar, ver publicaciones y ver
    // pedidos EXISTEN. Dejarlos como «Próximamente» era mentir al usuario sobre su propia app.
    { icon: requireIcon('Store'), label: tieneNegocio ? 'Publicar en Life Book' : 'Abrir mi negocio', route: '/lifebook-sell' },
    { icon: requireIcon('Package'), label: 'Mis publicaciones', route: '/lifebook-merchant-products' },
    // La pantalla del CATÁLOGO (rejilla de dos columnas con precio, categorías con «Todo»
    // primero, ciudad, orden y buscador) estaba entera y funcionando… y **no había ni un
    // sitio en toda la app que la abriera**: era inalcanzable. Esta es su puerta.
    // Se usa `LayoutGrid` y no `ShoppingBag` porque esa ya es la de «Ecomerse»: dos
    // entradas distintas con el mismo icono se confunden.
    { icon: requireIcon('LayoutGrid'), label: 'Catálogo de productos', route: '/lifebook-catalog' },
    { icon: requireIcon('ShoppingCart'), label: 'Mis pedidos', route: '/lifebook-orders' },
    { icon: requireIcon('Clapperboard'), label: 'Centro de creador', soon: true },
    { icon: requireIcon('Handshake'), label: 'Colaboraciones', soon: true },
  ];
  const S3: Item[] = [
    { icon: requireIcon('UserPlus'), label: 'Agregar amigo', soon: true },
    { icon: requireIcon('StickyNote'), label: 'Mis borradores', soon: true },
    { icon: requireIcon('CalendarDays'), label: 'Mis actividades', soon: true },
    { icon: requireIcon('Clock'), label: 'Historial de visitas', soon: true },
    { icon: requireIcon('Download'), label: 'Mis descargas', soon: true },
    { icon: requireIcon('ScanLine'), label: 'Escanear', route: '/scanner' },
  ];
  const S4: Item[] = [
    { icon: requireIcon('HelpCircle'), label: 'Ayuda y soporte', soon: true },
    { icon: requireIcon('FileQuestion'), label: 'Preguntas frecuentes', soon: true },
    { icon: requireIcon('Headset'), label: 'Contactar soporte', soon: true },
  ];

  const avatarSrc = userAvatar ? absUrl(userAvatar) : null;

  const renderGroup = (title: string, items: Item[], dangerLast?: boolean) => (
    <View key={title}>
      <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.groupCard, { backgroundColor: colors.card }]}>
        {items.map((it, i) => {
          const Icon = it.icon;
          const last = dangerLast && i === items.length - 1;
          return (
            <Pressable
              key={it.label}
              onPress={it.action ?? (it.soon ? soon : () => go(it.route))}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' },
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
            >
              <View style={[styles.rowIcon, { backgroundColor: last ? alpha(colors.danger, 0.1) : alpha(colors.primary, 0.08) }]}>
                <Icon size={18} color={last ? colors.danger : colors.primary} />
              </View>
              <Text style={[styles.rowLabel, { color: last ? colors.danger : colors.textPrimary }]} numberOfLines={1}>
                {it.label}
              </Text>
              {it.soon ? (
                <Text style={[styles.soonBadge, { color: colors.secondary, backgroundColor: alpha(colors.secondary, 0.12) }]}>Próximamente</Text>
              ) : (
                <ChevronRight size={16} color={colors.textSecondary} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        {/* Backdrop atenuado: toque fuera cierra */}
        <Animated.View style={[styles.backdrop, { backgroundColor: colors.overlay, opacity }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar menú" />
        </Animated.View>

        {/* Panel lateral derecho */}
        <Animated.View style={[styles.panel, { transform: [{ translateX }], backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
          {/* Cabecera compacta */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={[styles.headerAvatar, { backgroundColor: alpha(colors.primary, 0.14) }]}>
              {avatarSrc ? (
                <Image source={{ uri: avatarSrc }} style={styles.headerAvatarImg} />
              ) : (
                <Text style={[styles.headerAvatarTxt, { color: colors.primary }]}>
                  {(userName || 'U').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerName, { color: colors.textPrimary }]} numberOfLines={1}>{userName}</Text>
              <Text style={[styles.headerRole, { color: colors.textSecondary }]}>{roleLabel} · EG Route Plan</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar menú" style={styles.closeBtn}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: espaciado.e12 }}>
            {/* TU CUENTA, primero: la puerta a tu perfil de Life Book tiene que verse sin
                desplazar. Antes iba en «Cuenta y actividad», dos desplazamientos más abajo. */}
            {renderGroup('Tu cuenta', S0)}
            {/* Los negocios del comerciante, ARRIBA: es lo que viene a hacer aquí. */}
            {renderNegocios()}
            {renderGroup('Servicios', visibles)}
            {ocultos.length > 0 ? (
              <Pressable
                onPress={() => setVerTodos((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: verTodos }}
                accessibilityLabel={verTodos ? 'Ver menos servicios' : `Ver todos los servicios, ${ocultos.length} más`}
                hitSlop={6}
                style={({ pressed }) => [styles.verTodos, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.rowLabel, { color: colors.primary, textAlign: 'center' }]}>
                  {verTodos ? 'Ver menos' : `Ver todos los servicios · ${ocultos.length}`}
                </Text>
              </Pressable>
            ) : null}
            {renderGroup('Comercio y creador', S2)}
            {renderGroup('Cuenta y actividad', S3)}
            {renderGroup('Soporte', S4)}
            {/* Emergencia: fila roja separada (semántica estricta) */}
            <Pressable
              onPress={() => { onClose(); onEmergency(); }}
              style={({ pressed }) => [styles.emergencyRow, { backgroundColor: pressed ? alpha(colors.danger, 0.12) : alpha(colors.danger, 0.07) }]}
            >
              <View style={[styles.rowIcon, { backgroundColor: alpha(colors.danger, 0.14) }]}>
                {(() => { const Icon = requireIcon('Siren'); return <Icon size={18} color={colors.danger} />; })()}
              </View>
              <Text style={[styles.rowLabel, { color: colors.danger }]}>Emergencia</Text>
              <ChevronRight size={16} color={colors.danger} />
            </Pressable>
          </ScrollView>

          {/* Ajustes FIJO al pie → página independiente */}
          <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
            <Pressable
              onPress={() => go('/settings')}
              style={({ pressed }) => [styles.settingsBtn, { backgroundColor: pressed ? alpha(colors.primary, 0.1) : colors.surface }]}
            >
              {(() => { const Icon = requireIcon('Settings'); return <Icon size={18} color={colors.textPrimary} />; })()}
              <Text style={[styles.settingsTxt, { color: colors.textPrimary }]}>Ajustes</Text>
              <ChevronRight size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Icons lucide importados estáticamente (Metro). */
const ICON_MAP: Record<string, LucideIcon> = {
  Ticket, Briefcase, ShoppingBag, Utensils, Route, CarTaxiFront, History, KeyRound,
  Wallet, Store, Clapperboard, BadgeCheck, Handshake, Package, Wrench, Sparkles,
  UserPlus, UserRound, StickyNote, CalendarDays, Clock, Download, ShoppingCart,
  ScanLine, HelpCircle, FileQuestion, Headset, Settings, Siren, UserCog, LayoutGrid,
  // Verticales de «Tus negocios» (los añade core/useMisNegocios devolviendo el vertical).
  BedDouble, UtensilsCrossed,
};
function requireIcon(name: string): LucideIcon {
  return ICON_MAP[name];
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  panel: {
    width: DRAWER_W, maxWidth: '88%', height: '100%', marginLeft: 'auto',
    ...elevation.lg,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerAvatar: { width: 40, height: 40, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerAvatarImg: { width: '100%', height: '100%' },
  headerAvatarTxt: { fontSize: tipografia.subCabecera, fontWeight: peso.titulo },
  headerName: { fontSize: tipografia.fino, fontWeight: peso.maximo },
  headerRole: { fontSize: tipografia.micro, fontWeight: peso.medio, marginTop: 1 },
  closeBtn: { padding: espaciado.e4 },
  groupTitle: { fontSize: tipografia.micro, fontWeight: peso.maximo, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: espaciado.e14, marginBottom: espaciado.e6, paddingHorizontal: espaciado.e16 },
  groupCard: { borderRadius: radios.campo, overflow: 'hidden', marginHorizontal: espaciado.e10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e11 },
  rowIcon: { width: 30, height: 30, borderRadius: radios.sm, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: tipografia.body, fontWeight: peso.fuerte },
  /** Enlace de «ver todos los servicios» (divulgación progresiva del grupo Servicios). */
  verTodos: { marginHorizontal: espaciado.e10, marginTop: espaciado.e6, paddingVertical: espaciado.e8, alignItems: 'center' },
  soonBadge: { fontSize: tipografia.minimo, fontWeight: peso.maximo, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e2, borderRadius: radios.marca, overflow: 'hidden' },
  emergencyRow: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    marginHorizontal: espaciado.e10, marginTop: espaciado.e12, borderRadius: radios.campo,
    paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e11,
  },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: espaciado.e10, paddingTop: espaciado.e10 },
  settingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e12,
  },
  settingsTxt: { flex: 1, fontSize: tipografia.body, fontWeight: peso.maximo },
});
