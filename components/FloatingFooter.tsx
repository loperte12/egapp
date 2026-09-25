/**
 * DockFooter — barra de navegación inferior FIJA (dock) de la pantalla de
 * inicio: Inicio, Life Book, Llamar Taxi, Monedero y Perfil.
 * (2026-09-09: se quitó la pestaña Emergencia del dock; la emergencia ahora es
 * un botón flotante sobre el MAPA con cruz médica — decisión del dueño.)
 * (2026-09-10: Life Book entra en el dock como pestaña central del producto —
 * la "plaza digital" NO es una app aparte: vive en la app principal.)
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, CarTaxiFront, MessageCircle, User, Users, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { useUnreadChat } from '../hooks/useUnreadChat';
import { brand, elevation, espaciado, peso, trazo, radios, tipografia} from '@egrouteplan/ui-kit';

export type FooterTab = 'inicio' | 'lifebook' | 'taxi' | 'mensajes' | 'monedero' | 'perfil' | 'emergencia';

/** Altura fija del dock sin safe-area (la usa la Home como bottomInset). */
export const DOCK_BODY_H = 62;

// Orden del dock (decisión del dueño 2026-09-10): Life Book PRIMERO (es donde
// entra la app al abrirse), Inicio EXACTO en el centro, Mensajes en la cuarta
// plaza y Monedero fuera (vive en "Más servicios" de la Home).
const TABS: Array<{ id: FooterTab; label: string; icon: LucideIcon }> = [
  { id: 'lifebook', label: 'Life Book', icon: Users },
  { id: 'taxi', label: 'Llamar Taxi', icon: CarTaxiFront },
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'mensajes', label: 'Mensajes', icon: MessageCircle },
  { id: 'perfil', label: 'Perfil', icon: User },
];

export default function DockFooter({
  active,
  onNavigate,
  onEmergency,
  showUnreadBadge = false,
}: {
  active?: FooterTab;
  onNavigate: (tab: FooterTab) => void;
  /** Conservado por compatibilidad; la emergencia ya no vive en el dock. */
  onEmergency?: () => void;
  /**
   * B8 (2026-09-12): mostrar el contador de mensajes sin leer sobre la pestaña
   * «Mensajes» del dock.
   *
   * **Por defecto `false` a propósito.** Este componente lo pintan 7 pantallas
   * (`index`, `lifebook`, `lifebook-explore`, `lifebook-messages`,
   * `lifebook-orders`, `lifebook-store`, `profile`); activarlo por defecto
   * montaría el hook —y con él un sondeo de red cada 15 s— en las siete a la
   * vez. Lo enciende quien lo necesita, y el hook ya deduplica: aunque varias
   * pantallas estén montadas, solo hay UN temporizador vivo (ver
   * `hooks/useUnreadChat.ts`).
   *
   * No se activa en `lifebook-messages.tsx`: estando ya dentro de los mensajes,
   * un badge sobre la pestaña activa no aporta nada.
   */
  showUnreadBadge?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Se llama SIEMPRE (las reglas de los hooks no permiten llamarlo dentro de un
  // `if`), pero el hook solo arranca el sondeo si hay suscriptores — y al no
  // querer el badge, el valor simplemente no se usa.
  const { unread } = useUnreadChat();
  const badge = showUnreadBadge ? unread : 0;

  return (
    <View
      style={[
        styles.dock,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
          height: DOCK_BODY_H + insets.bottom,
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        const tint = isActive ? colors.primary : colors.textSecondary;
        const Icon = tab.icon;
        const esMensajes = tab.id === 'mensajes';
        const n = esMensajes ? badge : 0;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onNavigate(tab.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={n > 0 ? `${tab.label}, ${n} sin leer` : tab.label}
            style={({ pressed }) => [
              styles.item,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <View>
              <Icon size={21} color={tint} strokeWidth={isActive ? 2.3 : 2} />
              {n > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{n > 9 ? '9+' : n}</Text>
                </View>
              )}
            </View>
            <Text
              style={[styles.label, { color: tint }, isActive && styles.labelStrong]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: trazo.fino,
    
    ...elevation.lg,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaciado.e2,
    paddingVertical: espaciado.e6,
  },
  label: { fontSize: tipografia.nota, fontWeight: peso.fuerte },
  labelStrong: { fontWeight: peso.titulo },
  /* Badge de no leídos (B8). Mismos colores que el badge de la barra superior de
     `lifebook.tsx`, para que el contador se vea igual arriba y abajo: rojo XHS y
     borde blanco que lo separa del icono. */
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: brand.like,
    borderRadius: radios.hermano,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: trazo.base,
    borderColor: brand.white,
    paddingHorizontal: espaciado.e3,
  },
  badgeText: { color: brand.white, fontSize: 9, fontWeight: peso.titulo },
});
