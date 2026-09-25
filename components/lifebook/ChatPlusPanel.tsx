/**
 * ChatPlusPanel — panel de acciones del botón "+" del chat.
 *
 * `PENDING` = acciones que todavía NO puede ejecutar el servidor: se muestran
 * marcadas como «pronto» para que nadie crea que ya funcionan.
 *
 * REALES hoy: **las 12 acciones**. Compartir nota y venta, foto, cámara,
 * archivo, **ubicación** (`groupMap`), **votación** (`vote`), **cadena**
 * (`chain`), **quedada** (`checkin`), **tema** (`topic`), **anuncio de grupo**
 * (`groupAd`, con el límite de 15 al día) y **Plaza de retos**
 * (`challengePlaza`, que abre la lista de retos).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera, Image as ImageIcon, Share2, Paperclip, ShoppingBag, Tag, Hash,
  Map, CalendarCheck, ListOrdered, Vote, Megaphone, ScrollText,
} from 'lucide-react-native';
import { alpha, espaciado, useTheme, peso, tipografia, radios} from '@egrouteplan/ui-kit';
import type { LbChatAction } from '../../api/messages';
import { brand } from '@egrouteplan/ui-kit';

const ACTIONS: { id: LbChatAction; label: string; icon: any; color: string }[] = [
  { id: 'photos', label: 'Fotos', icon: ImageIcon, color: brand.primary },
  { id: 'camera', label: 'Cámara', icon: Camera, color: brand.success },
  { id: 'shareNote', label: 'Compartir nota', icon: Share2, color: brand.lifebook },
  /* TANDA D: la tarjeta de PRODUCTO (imagen, nombre, precio y botón de compra). Es distinta de
     «Compartir nota»: el producto no vive solo en el catálogo, vive también dentro del chat. */
  { id: 'product', label: 'Producto', icon: ShoppingBag, color: brand.primary },
  { id: 'file', label: 'Archivo', icon: Paperclip, color: brand.secondary },
  { id: 'sale', label: 'Venta personal', icon: Tag, color: brand.social },
  { id: 'topic', label: 'Tema', icon: Hash, color: brand.primary },
  { id: 'groupMap', label: 'Ubicación', icon: Map, color: brand.success },
  { id: 'checkin', label: 'Quedada', icon: CalendarCheck, color: brand.secondary },
  { id: 'chain', label: 'Cadena', icon: ListOrdered, color: brand.lifebook },
  { id: 'vote', label: 'Votación', icon: Vote, color: brand.like },
  { id: 'groupAd', label: 'Anuncio del grupo', icon: Megaphone, color: brand.social },
  { id: 'challengePlaza', label: 'Plaza de retos', icon: ScrollText, color: brand.primary },
];

/** Ya no queda ninguna acción pendiente: las 12 funcionan. */
const PENDING = new Set<LbChatAction>([]);

interface Props {
  visible: boolean;
  /** Si es grupo mostramos todo; si es 1:1 ocultamos las de grupo. */
  isGroup?: boolean;
  onAction: (a: LbChatAction) => void;
}

export function ChatPlusPanel({ visible, isGroup = false, onAction }: Props) {
  const { colors } = useTheme();
  if (!visible) return null;

  const items = ACTIONS.filter((a) =>
    // Ubicación, votación, quedada, cadena y Plaza de retos funcionan también en
    // 1 a 1 (Partes 24–26); el tema y el anuncio son de grupo.
    isGroup ? true : !['topic', 'groupAd'].includes(a.id),
  );

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderTopColor: alpha(colors.textPrimary, 0.08) }]}>
      {items.map((a) => {
        const Icon = a.icon;
        const pending = PENDING.has(a.id);
        return (
          <Pressable key={a.id} onPress={() => onAction(a.id)} style={styles.cell} hitSlop={4}>
            <View style={[styles.iconBox, { backgroundColor: alpha(a.color, pending ? 0.07 : 0.14) }]}>
              <Icon size={20} color={pending ? alpha(a.color, 0.55) : a.color} />
            </View>
            <Text numberOfLines={2} style={[styles.label, { color: colors.textSecondary }]}>
              {a.label}
            </Text>
            {pending ? <Text style={[styles.pronto, { color: alpha(colors.textSecondary, 0.9) }]}>pronto</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: espaciado.e10, paddingTop: espaciado.e12, paddingBottom: espaciado.e14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cell: { width: '25%', alignItems: 'center', marginBottom: espaciado.e14, paddingHorizontal: espaciado.e4 },
  iconBox: { width: 52, height: 52, borderRadius: radios.campo, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: tipografia.micro, fontWeight: peso.medio, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 13 },
  pronto: { fontSize: tipografia.rotulo, fontWeight: peso.maximo, marginTop: 1 },
});
