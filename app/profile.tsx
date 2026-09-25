/**
 * ProfileScreen — PERFIL estilo Xiaohongshu (EG Route Plan).
 *
 * Estructura (rediseño aprobado 2026-09-09 + feedback):
 *  · Portada full-width edge-to-edge que CRECE hasta incluir el título
 *    "Life Book"; dentro de la portada (bajo las stats): bio breve, enlaces y
 *    correos del usuario (chips), y al pie el título Life Book.
 *  · ✎ Editar perfil (arriba-izquierda) → /edit-profile; ☰ debajo transparente.
 *  · Identidad dentro de la portada: avatar tocable (→ modal cambiar foto),
 *    nombre + píldora PROFESIÓN tocable (→ selector del catálogo Work), EG
 *    Route Plan ID + QR, ubicación tocable (→ selector internacional).
 *  · Stats: Seguidores · Seguidos · Me gusta · ★ Valoración (al final).
 *  · Sin barra inferior de perfil; solo dock global. Ajustes y modo conductor
 *    viven en el drawer ☰. Sin teléfonos en la UI.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, Modal, Pressable,
  ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
// Parte 31: expo-image (caché memoria+disco) para la portada — evita el
// destello blanco que hacía <ImageBackground> al volver a la pestaña.
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { pickImageFromCamera, pickImageFromLibrary } from '../core/pickImage';
import {
  BedDouble, Briefcase, CarTaxiFront, ChevronRight, Globe, Heart, ImageIcon, Link2, Mail,
  MapPin, Menu, Pencil, Phone, Plus, QrCode, Settings, ShieldCheck, Sparkles, Star, Store, UserPlus, Users,
  UtensilsCrossed, X,
} from 'lucide-react-native';
import { alpha, espaciado, FormField, GhostButton, PrimaryButton, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { authApi, type MeProfile } from '../api/auth';
import { hotelApi } from '../api/hotel';
import { commerceApi } from '../api/commerce';
import { foodApi } from '../api/food';
import { workApi } from '../api/work';
import { taxiApi } from '../api/taxi';
import { useMisNegocios, type VerticalNegocio } from '../core/useMisNegocios';
import { absUrl } from '../api/config';
import EditProfileModal from '../components/EditProfileModal';
import ServicesDrawer from '../components/ServicesDrawer';
import FloatingFooter, { DOCK_BODY_H, type FooterTab } from '../components/FloatingFooter';
import { useAppDock } from '../core/useAppDock';
import { lifebookApi, toPostCard, type LbPostBase, type LbProfile } from '../api/lifebook';
import { PostCard } from '../components/lifebook/PostCard';
import EmergencyModal from '../components/EmergencyModal';
import StatusRingAvatar from '../components/status/StatusRingAvatar';
import StatusChip from '../components/status/StatusChip';
import StatusEditorModal from '../components/status/StatusEditorModal';
import StatusDetailModal from '../components/status/StatusDetailModal';
import { useStatusStore } from '../state/statusStore';
import { COUNTRIES, GQ_CITIES } from '../constants/countries';
import { PROFESSIONS } from '../constants/professions';
import { ir as irSeguro } from '../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

/** Portada por defecto: atardecer de la playa de Ureka (foto libre CC BY-SA 4.0). */
const COVER_BG = 'https://hk.egrouteplan.com/wallet/assets/profile-bg-ureka.jpg';

type LB_TAB = 'todo' | 'fotos' | 'ventas' | 'gustos';

export default function ProfileScreen() {
  return (
    <AuthGate>
      <ProfileContent />
    </AuthGate>
  );
}

/**
 * Parte 31: caché en memoria del perfil (ver `ProfileContent`). Vive a nivel de
 * módulo para sobrevivir al desmontaje de la pantalla al cambiar de pestaña.
 */
let profileCache: MeProfile | null = null;

function ProfileContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  /**
   * Parte 31 (navegación fluida): el perfil se guarda en una caché en memoria.
   * Antes, cada entrada a la pestaña Perfil montaba la pantalla de cero y
   * mostraba un spinner a pantalla completa (parpadeo). Ahora se pinta al
   * instante con lo último conocido y se refresca en segundo plano.
   */
  const [profile, setProfileState] = useState<MeProfile | null>(profileCache);
  const setProfile = useCallback((p: MeProfile | null) => {
    profileCache = p;
    setProfileState(p);
  }, []);
  const [loading, setLoading] = useState(!profileCache);
  const [activeTrip, setActiveTrip] = useState<Record<string, any> | null>(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusDetailOpen, setStatusDetailOpen] = useState(false);
  const { status: myStatus, loading: statusLoading, refresh: refreshStatus, localExpire } = useStatusStore();
  const [emptyStat, setEmptyStat] = useState<string | null>(null);
  const [lbTab, setLbTab] = useState<LB_TAB>('todo');
  const scrollRef = useRef<ScrollView>(null);
  // Datos REALES de Life Book (perfil unificado: estilo propio + datos del backend).
  const [lbProfile, setLbProfile] = useState<LbProfile | null>(null);
  const [lbPosts, setLbPosts] = useState<LbPostBase[]>([]);
  const [lbLoadingPosts, setLbLoadingPosts] = useState(false);

  const refresh = useCallback(() => authApi.me().then(setProfile).catch(() => {}), [setProfile]);

  useEffect(() => { refresh().finally(() => setLoading(false)); }, [refresh]);

  /**
   * ══ TUS NEGOCIOS ══ el acceso PROPIO del comerciante.
   *
   * La detección vive en `core/useMisNegocios` porque sale en DOS sitios: aquí y en el menú
   * lateral (☰). Si cada pantalla la hiciera por su cuenta, en dos semanas una conocería el
   * restaurante y la otra no. El estándar completo: `ESTANDAR-ENTORNOS-DE-CONTROL.md`.
   */
  const { negocios } = useMisNegocios(profile?.id);

  // Perfil público real (estadísticas, verificación) + publicaciones por pestaña.
  useEffect(() => {
    const id = profile?.id;
    if (!id) return;
    lifebookApi.profile(id).then(setLbProfile).catch(() => setLbProfile(null));
  }, [profile?.id]);

  useEffect(() => {
    const id = profile?.id;
    if (!id) return;
    // Parte 16: la pestaña «Guardados» son MIS publicaciones guardadas.
    if (lbTab === 'gustos') {
      setLbLoadingPosts(true);
      lifebookApi.mySaves({ limit: 30 })
        .then((page) => setLbPosts(page.posts ?? []))
        .catch(() => setLbPosts([]))
        .finally(() => setLbLoadingPosts(false));
      return;
    }
    const type = lbTab === 'fotos' ? 'note' : lbTab === 'ventas' ? 'sale' : undefined;
    setLbLoadingPosts(true);
    lifebookApi.userPosts(id, { type, limit: 30 })
      .then((page) => setLbPosts(page.posts ?? []))
      .catch(() => setLbPosts([]))
      .finally(() => setLbLoadingPosts(false));
  }, [profile?.id, lbTab]);

  // Viaje en curso (persistencia del dueño): tarjeta para volver a /taxi.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setActiveLoading(true);
      taxiApi.activeTrip()
        .then((t) => { if (alive) setActiveTrip(t); })
        .catch(() => { if (alive) setActiveTrip(null); })
        .finally(() => { if (alive) setActiveLoading(false); });
      return () => { alive = false; };
    }, []),
  );

  const dockNav = useAppDock('perfil');
  const handleNavigate = useCallback((next: FooterTab) => {
    // Perfil: si ya estamos, subimos arriba; el resto, navegación ÚNICA del dock.
    if (next === 'perfil') { scrollRef.current?.scrollTo({ y: 0, animated: true }); return; }
    dockNav(next);
  }, [dockNav]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const initial = (profile?.fullName ?? 'U').trim().charAt(0).toUpperCase() || 'U';
  const displayName = profile?.fullName ?? (profile?.role === 'DRIVER' ? 'Conductor' : 'Usuario');
  const roleLabel = profile?.role === 'DRIVER' ? 'Conductor' : profile?.role === 'ADMIN' ? 'Administrador' : 'Pasajero';
  const avatarSrc = profile?.avatarUrl ? absUrl(profile.avatarUrl) : null;
  const coverSrc = profile?.coverUrl ? absUrl(profile.coverUrl) : COVER_BG;
  const egId = profile ? `EG-${(profile.id.replace(/-/g, '').slice(0, 8)).toUpperCase()}` : 'EG-……';
  // Ubicación: país · ciudad (default GQ)
  const locLabel = [profile?.country ?? 'Guinea Ecuatorial', profile?.city].filter(Boolean).join(' · ');
  // Profesión mostrada = profile.profession si existe; si el rol es DRIVER y no
  // hay profesión, sugerimos 'Conductor' en la píldora pero se guarda aparte.
  const professionLabel = profile?.profession || (profile?.role === 'DRIVER' ? 'Conductor' : roleLabel);

  const showEmptyStat = (which: string) => {
    if (which === 'seguidores') setEmptyStat('Aún no tienes seguidores · Cuando la comunidad crezca, lo verás aquí.');
    else if (which === 'seguidos') setEmptyStat('Aún no sigues a nadie · Explora perfiles para empezar.');
    else setEmptyStat('Aún no tienes me gusta · Los me gusta de tus publicaciones aparecerán aquí.');
  };

  const bottomPad = DOCK_BODY_H + insets.bottom + 24;
  // Rejilla 2 columnas (mismo ritmo que el feed de Life Book).
  const gridCellW = (winW - 32 - 10) / 2;
  const coverH = Math.round(Math.min(Math.max(winH * 0.62, 420), 640));
  const coverStyle = [styles.cover, { height: coverH }];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        {/* ============ PORTADA edge-to-edge, crece hasta el título Life Book ============ */}
        <View style={coverStyle}>
          <ExpoImage
            source={coverSrc}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
          />
          <View style={styles.coverScrim} pointerEvents="none" />
          <View style={styles.coverScrimBottom} pointerEvents="none" />

          {/* Acciones IZQUIERDA: ✎ (arriba) + ☰ (debajo transparente) */}
          <View style={[styles.coverActions, { top: insets.top + 8 }]}>
            <Pressable
              onPress={() => irSeguro.libre('/edit-profile')}
              accessibilityRole="button"
              accessibilityLabel="Editar perfil"
              style={({ pressed }) => [styles.editCapsule, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Pencil size={14} color={brand.white} />
              <Text style={styles.editCapsuleTxt}>Editar perfil</Text>
            </Pressable>
            <Pressable
              onPress={() => setDrawerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Menú de servicios"
              style={({ pressed }) => [styles.menuGhostBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Menu size={20} color={brand.white} />
            </Pressable>
          </View>

          {/* Identidad dentro de la portada */}
          <View style={[styles.identityBlock, { paddingTop: insets.top + 84 }]}>
            <View style={styles.identityTopRow}>
              <StatusRingAvatar
                avatarUrl={profile?.avatarUrl ?? null}
                name={displayName}
                status={myStatus}
                size={88}
                ringWidth={4}
                onPress={() => setPhotoOpen(true)}
              />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text
                    style={[
                      styles.name,
                      profile?.nameColor
                        ? { color: profile.nameColor, textShadowColor: 'transparent' }
                        : null,
                    ]}
                    numberOfLines={1}
                  >
                    {displayName}
                  </Text>
                </View>
                {/* Profesión: se muestra en la fila de correos (primer chip) */}
                <Pressable onPress={() => setQrOpen(true)} accessibilityRole="button" accessibilityLabel="Ver mi código QR" style={styles.egIdRow}>
                  <Text style={styles.egId} numberOfLines={1}>{egId}</Text>
                  <View style={styles.qrMini}><QrCode size={14} color={brand.white} /></View>
                </Pressable>
                {/* Ubicación tocable → selector internacional */}
                <Pressable onPress={() => setLocOpen(true)} accessibilityRole="button" accessibilityLabel="Cambiar ubicación" style={styles.locRow}>
                  <MapPin size={12} color="rgba(255,255,255,0.92)" />
                  <Text style={styles.locTxt} numberOfLines={1}>{locLabel}</Text>
                  <ChevronRight size={12} color="rgba(255,255,255,0.85)" />
                </Pressable>
                {/* Estado 24h v3: chip con tiempo si hay estado → Detalle;
                    si no, botón "+ Agregar estado 24h" → Editor. */}
                {myStatus && !statusLoading ? (
                  <StatusChip
                    status={myStatus}
                    foreground={brand.white}
                    onPress={() => setStatusDetailOpen(true)}
                    onExpired={() => refreshStatus()}
                  />
                ) : (
                  <Pressable
                    onPress={() => setStatusOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Agregar estado 24h"
                    style={({ pressed }) => [styles.addStatusBtn, { borderColor: 'rgba(255,255,255,0.65)', opacity: pressed ? 0.75 : 1 }]}
                  >
                    <Plus size={11} color="rgba(255,255,255,0.95)" />
                    <Text style={styles.addStatusTxt}>Agregar estado 24h</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Stats REALES (Life Book): Seguidores · Seguidos · Me gusta · ★ */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}><Text style={styles.statValue}>{lbProfile?.stats.followers ?? 0}</Text><Text style={styles.statLabel}>Seguidores</Text></View>
              <View style={styles.statItem}><Text style={styles.statValue}>{lbProfile?.stats.following ?? 0}</Text><Text style={styles.statLabel}>Seguidos</Text></View>
              <View style={styles.statItem}><Text style={styles.statValue}>{lbProfile?.stats.likes ?? 0}</Text><Text style={styles.statLabel}>Me gusta</Text></View>
              <View style={styles.statItem}>
                <View style={styles.ratingValueRow}><Star size={14} color={brand.warning} fill={brand.warning} /><Text style={styles.statValue}>{(profile?.ratingAvg ?? 5).toFixed(1)}</Text></View>
                <Text style={styles.statLabel}>Valoración</Text>
              </View>
            </View>

            {/* Bio breve dentro de la portada */}
            {profile?.bio ? (
              <Text style={styles.bioTxt} numberOfLines={3}>{profile.bio}</Text>
            ) : null}

            {/* ENLACES Y CORREOS dentro de la portada (se editan en /edit-profile).
                La OCUPACIÓN va como PRIMER chip, delante del correo. */}
            <View style={styles.linksArea}>
              {/* Ocupación (profesión) — delante del correo */}
              <Pressable
                onPress={() => setProfOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Cambiar profesión"
                style={({ pressed }) => [styles.linkChip, styles.occupChip, { opacity: pressed ? 0.75 : 1 }]}
              >
                <Briefcase size={12} color={brand.warning} />
                <Text style={styles.linkChipTxt} numberOfLines={1}>{professionLabel}</Text>
              </Pressable>
              {(profile?.links?.length ?? 0) > 0 ? (
                profile!.links!.map((l, i) => {
                  const Icon = l.kind === 'email' ? Mail : l.kind === 'phone' ? Phone : l.kind === 'social' ? Globe : Link2;
                  const target = l.kind === 'email' ? `mailto:${l.value}` : l.kind === 'phone' ? `tel:${l.value}` : l.value;
                  return (
                    <Pressable
                      key={`${l.label}-${i}`}
                      onPress={() => Linking.openURL(target).catch(() => {})}
                      accessibilityRole="link"
                      style={({ pressed }) => [styles.linkChip, { opacity: pressed ? 0.75 : 1 }]}
                    >
                      <Icon size={12} color={brand.white} />
                      <Text style={styles.linkChipTxt} numberOfLines={1}>{l.label || l.value}</Text>
                    </Pressable>
                  );
                })
              ) : null}
            </View>

            {/* (Sin título "Life Book": innecesario dentro del propio módulo) */}
          </View>
        </View>

        {/* ============ CONTENIDO (con márgenes) ============ */}
        <View style={styles.body}>
          {/* Viaje en curso (solo pasajero) */}
          {!activeLoading && activeTrip && profile?.role !== 'DRIVER' && (
            <Pressable
              onPress={() => router.push('/taxi' as any)}
              accessibilityRole="button"
              accessibilityLabel="Volver a mi viaje en curso"
              style={({ pressed }) => [tripCard.card, { backgroundColor: colors.card, borderColor: brand.secondary, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[tripCard.iconBox, { backgroundColor: alpha(brand.secondary, 0.12) }]}>
                <CarTaxiFront size={20} color={brand.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: brand.secondary, fontSize: 10.5, fontWeight: peso.titulo, letterSpacing: 0.3 }}>{activeTripLabel(String(activeTrip.status))}</Text>
                <Text style={[tripCard.title, { color: colors.textPrimary }]}>Mi viaje en curso</Text>
                <Text style={[tripCard.sub, { color: colors.textSecondary }]} numberOfLines={1}>
                  {String(activeTrip.pickup_address ?? 'Punto de recogida')} → {String(activeTrip.dropoff_address ?? 'Destino')}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </Pressable>
          )}

          {/*
            ══ TUS NEGOCIOS ══
            Un negocio por fila, cada uno con su entorno de control. Aparece SIEMPRE que la
            cuenta tenga negocio —no solo con el perfil vacío— y va en la cuenta, no dentro de
            una pantalla de consumidor. Detalle del estándar: ESTANDAR-ENTORNOS-DE-CONTROL.md
          */}
          {negocios && negocios.length ? (
            <View style={{ marginBottom: espaciado.e16 }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.titulo, letterSpacing: 0.5, marginBottom: espaciado.e7, marginLeft: espaciado.e2 }}>
                {negocios.length > 1 ? `TUS NEGOCIOS (${negocios.length})` : 'TU NEGOCIO'}
              </Text>

              {negocios.map((n) => (
                <FilaNegocio
                  key={n.clave}
                  icono={iconoDeVertical(n.vertical, colors.primary)}
                  titulo={n.titulo}
                  detalle={n.detalle}
                  nota={n.nota}
                  onPress={() => irSeguro.libre(String(n.ruta ?? ''))}
                />
              ))}

              <FilaNegocio
                icono={<Plus size={18} color={colors.primary} />}
                titulo="Abrir otro negocio"
                detalle="Publica un producto, comida, servicio o alquiler en Life Book"
                onPress={() => irSeguro.libre('/lifebook-sell')}
              />
            </View>
          ) : null}

          {/* MODERACIÓN (solo ADMIN). Primera pantalla de administración de la app: hasta ahora los
              moderadores trabajaban directamente contra la base de datos. Va aquí, junto a «Tus
              negocios», porque es una herramienta de trabajo y no una opción de usuario; y solo se
              pinta si el rol es ADMIN (`profile.role`, el mismo dato que usa el saludo de arriba).
              Ojo: la pintarla solo aquí NO es la seguridad — la comprueba el servidor con
              `@Roles('ADMIN')`; esto es solo no enseñar una puerta que no se puede abrir. */}
          {profile?.role === 'ADMIN' ? (
            <View style={{ marginBottom: espaciado.e16 }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.titulo, letterSpacing: 0.5, marginBottom: espaciado.e7, marginLeft: espaciado.e2 }}>
                MODERACIÓN
              </Text>
              <FilaNegocio
                icono={<ShieldCheck size={18} color={colors.primary} />}
                titulo="Documentación de vendedores"
                detalle="Revisa las facturas y certificados que suben los vendedores del Mercado"
                onPress={() => irSeguro.libre('/ecomerse-docs')}
              />
            </View>
          ) : null}

          {/* Pestañas de Life Book (fuera de la portada) */}
          <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
            {([['todo', 'Todo'], ['fotos', 'Fotos'], ['ventas', 'Ventas'], ['gustos', 'Guardados']] as Array<[LB_TAB, string]>).map(([k, label]) => {
              const active = lbTab === k;
              return (
                <Pressable key={k} onPress={() => setLbTab(k)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={styles.tabItem}>
                  <Text style={[styles.tabTxt, { color: active ? colors.textPrimary : colors.textSecondary, fontWeight: active ? '900' : '600' }]}>{label}</Text>
                  {active && <View style={[styles.tabUnderline, { backgroundColor: colors.primary }]} />}
                </Pressable>
              );
            })}
          </View>

          {/* Rejilla REAL de publicaciones (perfil unificado) */}
          {lbLoadingPosts ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e24 }} />
          ) : lbPosts.length > 0 ? (
            <View style={styles.lbGrid}>
              {lbPosts.map((p) => (
                <PostCard
                  key={p.id}
                  post={toPostCard(p)}
                  width={gridCellW}
                  onPress={(id) => irSeguro.libre('/lifebook-post/[id]', { id })}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.lbEmpty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.lbEmptyIcon, { backgroundColor: alpha(colors.primary, 0.08) }]}><ImageIcon size={26} color={colors.primary} /></View>
              <Text style={[styles.lbEmptyTitle, { color: colors.textPrimary }]}>
                {lbTab === 'gustos' ? 'Aquí verás lo que guardes' : lbTab === 'ventas' ? 'Aún no tienes ventas' : 'Aún no has publicado nada'}
              </Text>
              <Text style={[styles.lbEmptyBody, { color: colors.textSecondary }]}>
                {lbTab === 'gustos'
                  ? 'Toca el marcador de cualquier publicación y aparecerá aquí.'
                  : 'Comparte tu día, tus ventas o tu trabajo. Tu historia empieza aquí.'}
              </Text>
              <View style={styles.lbActions}>
                <ChipBtn label="Publicar" onPress={() => irSeguro.libre('/lifebook-compose')} />
                {/* Parte 33: «Vender» ya no es un placeholder muerto — abre el
                    publicador de comercio (tienda + producto o servicio). */}
                <ChipBtn label="Vender" onPress={() => irSeguro.libre('/lifebook-sell')} />
                {/* Aquí estaba el chip «Mi tienda», y se ha quitado: solo se pintaba en este
                    estado vacío (al comerciante con publicaciones le desaparecía) y ahora el
                    acceso al comercio es el bloque «Tu comercio» de arriba, que está siempre. */}
              </View>
            </View>
          )}

          <Text style={[styles.version, { color: colors.textSecondary }]}>EG Route Plan · v1.0.0</Text>
        </View>
      </ScrollView>

      {/* Dock global */}
      <FloatingFooter active="perfil" onNavigate={handleNavigate} onEmergency={() => setEmergencyOpen(true)} showUnreadBadge />

      {/* Drawer ☰ */}
      <ServicesDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userName={displayName}
        userAvatar={profile?.avatarUrl ?? null}
        roleLabel={roleLabel}
        role={profile?.role}
        cuenta={profile?.id ?? null}
        onEmergency={() => { setDrawerOpen(false); setEmergencyOpen(true); }}
      />

      {profile && <EditProfileModal visible={editOpen} profile={profile} onClose={() => setEditOpen(false)} onSaved={(p) => { setProfile(p); setEditOpen(false); }} />}

      {profile && <PhotoModal visible={photoOpen} profile={profile} onClose={() => setPhotoOpen(false)} onSaved={(p) => { setProfile(p); setPhotoOpen(false); }} />}

      {profile && <QrModal visible={qrOpen} egId={egId} onClose={() => setQrOpen(false)} onShare={() => setQrOpen(false)} />}

      {/* Editor del ESTADO 24h (v3) */}
      <StatusEditorModal
        visible={statusOpen}
        onClose={() => setStatusOpen(false)}
        onSaved={() => { refreshStatus(); }}
      />

      {/* Detalle del ESTADO 24h (v3) — mi propio estado */}
      {myStatus && (
        <StatusDetailModal
          visible={statusDetailOpen}
          status={myStatus}
          isMine
          author={profile ? { id: profile.id, fullName: displayName, avatarUrl: profile.avatarUrl ?? null, role: profile.role, nameColor: profile.nameColor ?? '' } : null}
          onClose={() => setStatusDetailOpen(false)}
          onEnded={() => localExpire()}
        />
      )}

      {/* Selector de ubicación internacional */}
      {profile && (
        <LocationModal
          visible={locOpen}
          profile={profile}
          onClose={() => setLocOpen(false)}
          onSaved={(p) => { setProfile(p); setLocOpen(false); }}
        />
      )}

      {/* Selector de profesión (catálogo Buscar Work) */}
      {profile && (
        <ProfessionModal
          visible={profOpen}
          profile={profile}
          onClose={() => setProfOpen(false)}
          onSaved={(p) => { setProfile(p); setProfOpen(false); }}
        />
      )}

      <EmptyStateModal visible={emptyStat !== null} text={emptyStat ?? ''} onClose={() => setEmptyStat(null)} />
      <EmergencyModal visible={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
    </View>
  );
}

/** Chip de acción genérico. */
/**
 * El icono de cada vertical.
 *
 * No lo devuelve el hook a propósito (`core/useMisNegocios` es un `.ts`, sin JSX): devuelve el
 * `vertical` y cada pantalla lo pinta. Así el hook no depende del kit de UI y se puede usar
 * desde cualquier sitio.
 */
export function iconoDeVertical(vertical: VerticalNegocio, color: string): React.ReactNode {
  switch (vertical) {
    case 'hotel': return <BedDouble size={18} color={color} />;
    case 'restaurante': return <UtensilsCrossed size={18} color={color} />;
    case 'trabajo': return <Briefcase size={18} color={color} />;
    case 'mercado':
    default: return <Store size={18} color={color} />;
  }
}

/**
 * Fila de «Tus negocios»: icono, título, detalle, aviso opcional y flecha.
 * 56 px de alto y `accessibilityLabel` con el texto completo, para que se pueda llegar con
 * lector de pantalla sin ambigüedad.
 *
 * `nota` existe para poder decir la verdad a medias: un negocio cuyo entorno de control ya
 * funciona pero que **todavía no está publicado en Life Book** lo dice, en vez de aparentar
 * que ya está integrado.
 */
function FilaNegocio({ icono, titulo, detalle, nota, onPress }: {
  icono: React.ReactNode; titulo: string; detalle: string; nota?: string; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${detalle}${nota ? ` ${nota}` : ''}`}
      style={({ pressed }) => [{
        flexDirection: 'row' as const, alignItems: 'center' as const, gap: espaciado.e11,
        borderWidth: 1, borderRadius: 14, padding: espaciado.e12, marginBottom: espaciado.e8, minHeight: 56,
        borderColor: colors.border, backgroundColor: colors.card,
        opacity: pressed ? 0.8 : 1,
      }]}
    >
      <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.12) }}>
        {icono}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{titulo}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2, lineHeight: 17 }}>{detalle}</Text>
        {nota ? (
          <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e3, lineHeight: 16 }}>
            {nota}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

function ChipBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [chipStyles.chip, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[chipStyles.label, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, borderWidth: 1, borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 },
  label: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
});

/** Modal "Cambiar foto de perfil": SOLO cambia la foto. Usa core/pickImage
 *  (galería/cámara sin base64 inline → con spinner "Procesando…"). */
function PhotoModal({ visible, profile, onClose, onSaved }: { visible: boolean; profile: MeProfile; onClose: () => void; onSaved: (p: MeProfile) => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<'library' | 'camera' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);

  useEffect(() => { if (visible) { setNewPhoto(null); setError(null); setPicking(null); } }, [visible]);
  const preview = newPhoto ?? (profile.avatarUrl ? absUrl(profile.avatarUrl) : null);

  const pick = async (fromCamera: boolean) => {
    setError(null);
    setPicking(fromCamera ? 'camera' : 'library');
    try {
      const img = fromCamera ? await pickImageFromCamera() : await pickImageFromLibrary();
      if (img) setNewPhoto(img.dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : fromCamera ? 'No se pudo abrir la cámara' : 'No se pudo abrir la galería');
    } finally {
      setPicking(null);
    }
  };

  const save = async () => {
    if (!newPhoto) { onClose(); return; }
    setBusy(true); setError(null);
    try { const next = await authApi.updateMe({ avatar: newPhoto }); onSaved(next); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la foto'); }
    finally { setBusy(false); }
  };

  const initial = (profile.fullName ?? 'U').trim().charAt(0).toUpperCase() || 'U';
  const pickDisabled = busy || picking !== null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.sheetRoot, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheetCard, { backgroundColor: colors.card }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Cambiar foto de perfil</Text>
            <Pressable onPress={onClose} hitSlop={10}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <View style={{ alignItems: 'center', marginVertical: espaciado.e12 }}>
            <View style={[styles.photoLg, { backgroundColor: alpha(colors.primary, 0.12) }]}>
              {preview ? <Image source={{ uri: preview }} style={styles.photoLgImg} /> : <Text style={[styles.photoLgTxt, { color: colors.primary }]}>{initial}</Text>}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
            <Pressable
              onPress={() => pick(true)}
              disabled={pickDisabled}
              accessibilityRole="button"
              accessibilityLabel="Tomar foto con la cámara"
              style={[styles.pickBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: busy || (picking !== null && picking !== 'camera') ? 0.45 : 1 }]}
            >
              {picking === 'camera'
                ? <View style={styles.pickBusy}><ActivityIndicator color={colors.primary} size="small" /><Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Procesando…</Text></View>
                : <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>📷 Cámara</Text>}
            </Pressable>
            <Pressable
              onPress={() => pick(false)}
              disabled={pickDisabled}
              accessibilityRole="button"
              accessibilityLabel="Elegir desde la galería"
              style={[styles.pickBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: busy || (picking !== null && picking !== 'library') ? 0.45 : 1 }]}
            >
              {picking === 'library'
                ? <View style={styles.pickBusy}><ActivityIndicator color={colors.primary} size="small" /><Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Procesando…</Text></View>
                : <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>🖼️ Galería</Text>}
            </Pressable>
          </View>
          {error ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, textAlign: 'center' }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e6 }}>
            <View style={{ flex: 1 }}><GhostButton title="Cancelar" onPress={onClose} disabled={busy} /></View>
            <View style={{ flex: 1.4 }}><PrimaryButton title={busy ? 'Guardando…' : 'Guardar foto'} onPress={save} loading={busy} disabled={!newPhoto} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Modal QR del EG Route Plan ID. */
function QrModal({ visible, egId, onClose }: { visible: boolean; egId: string; onClose: () => void; onShare: () => void }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' }]}>
        <View style={[styles.qrCard, { backgroundColor: colors.card }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Mi código QR</Text>
            <Pressable onPress={onClose} hitSlop={10}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <Text style={[styles.qrSub, { color: colors.textSecondary }]}>Escanea para seguirme en EG Route Plan</Text>
          <View style={styles.qrBox}><QRCode value={egId} size={168} color="#10202E" backgroundColor={brand.white} /></View>
          <Text style={[styles.qrId, { color: colors.textPrimary }]}>{egId}</Text>
          <Text style={[styles.qrHint, { color: colors.textSecondary }]}>Tu EG Route Plan ID es único y no se puede cambiar.</Text>
        </View>
      </View>
    </Modal>
  );
}

/** Modal estado vacío simple. */
function EmptyStateModal({ visible, text, onClose }: { visible: boolean; text: string; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' }]}>
        <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
          <View style={[styles.emptyIcon, { backgroundColor: alpha(colors.primary, 0.08) }]}><Store size={30} color={colors.primary} /></View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{text.split(' · ')[0]}</Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{text.split(' · ').slice(1).join(' · ')}</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.emptyOk, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={styles.emptyOkTxt}>Entendido</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Selector de ubicación INTERNACIONAL: país (ISO) → ciudad (GQ chips o libre). */
function LocationModal({ visible, profile, onClose, onSaved }: { visible: boolean; profile: MeProfile; onClose: () => void; onSaved: (p: MeProfile) => void }) {
  const { colors } = useTheme();
  const [country, setCountry] = useState(profile.countryCode ?? 'GQ');
  const [city, setCity] = useState(profile.city ?? '');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setCountry(profile.countryCode ?? 'GQ');
      setCity(profile.city ?? '');
      setQ('');
      setError(null);
    }
  }, [visible, profile]);

  const sel = COUNTRIES.find((c) => c.code === country) ?? COUNTRIES[0];
  const filtered = COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase().includes(q.toLowerCase()));
  const isGQ = country === 'GQ';

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const next = await authApi.updateMe({ country: sel.name, countryCode: sel.code, city: city.trim() || undefined });
      onSaved(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la ubicación'); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.sheetRoot, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheetCardTall, { backgroundColor: colors.card }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Ubicación</Text>
            <Pressable onPress={onClose} hitSlop={10}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <FormField label="Buscar país (nombre o abreviatura)" placeholder="Guinea Ecuatorial (GQ)…" value={q} onChangeText={setQ} />
          <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
            {filtered.map((c) => {
              const active = c.code === country;
              return (
                <Pressable key={c.code} onPress={() => { setCountry(c.code); if (c.code !== 'GQ') setCity(''); }} style={({ pressed }) => [styles.pickRow, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' }]}>
                  <Text style={[styles.pickRowTxt, { color: active ? colors.primary : colors.textPrimary, fontWeight: active ? '900' : '600' }]}>{c.name}</Text>
                  <Text style={[styles.pickRowCode, { color: colors.textSecondary }]}>{c.code}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {isGQ ? (
            <View style={styles.cityChips}>
              <Text style={[styles.pickLabel, { color: colors.textSecondary }]}>Ciudad</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e7 }}>
                {GQ_CITIES.map((c) => {
                  const active = city === c;
                  return (
                    <Pressable key={c} onPress={() => setCity(active ? '' : c)} style={[styles.cityChip, { backgroundColor: active ? alpha(colors.primary, 0.14) : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
                      <Text style={{ color: active ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <FormField label="Ciudad" placeholder="Escribe tu ciudad…" value={city} onChangeText={setCity} />
          )}
          {error ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e8 }}>
            <View style={{ flex: 1 }}><GhostButton title="Cancelar" onPress={onClose} disabled={busy} /></View>
            <View style={{ flex: 1.4 }}><PrimaryButton title={busy ? 'Guardando…' : 'Guardar ubicación'} onPress={save} loading={busy} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Selector de profesión: catálogo de Buscar Work (PROFESSIONS). */
function ProfessionModal({ visible, profile, onClose, onSaved }: { visible: boolean; profile: MeProfile; onClose: () => void; onSaved: (p: MeProfile) => void }) {
  const { colors } = useTheme();
  const [sel, setSel] = useState(profile.profession ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState('');

  useEffect(() => { if (visible) { setSel(profile.profession ?? ''); setCustom(''); setError(null); } }, [visible, profile]);

  const save = async (prof: string) => {
    setBusy(true); setError(null);
    try { const next = await authApi.updateMe({ profession: prof || undefined }); onSaved(next); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la profesión'); }
    finally { setBusy(false); }
  };

  const active = (label: string) => sel === label;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.sheetRoot, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheetCardTall, { backgroundColor: colors.card }]}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Profesión</Text>
              <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>Sincronizada con Buscar Work</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            {PROFESSIONS.map((p) => {
              const isActive = active(p.label);
              return (
                <Pressable key={p.id} onPress={() => setSel(isActive ? '' : p.label)} style={({ pressed }) => [styles.pickRow, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' }]}>
                  <Briefcase size={17} color={isActive ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.pickRowTxt, { color: isActive ? colors.primary : colors.textPrimary, fontWeight: isActive ? '900' : '600' }]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <FormField label="Otra profesión…" placeholder="Escribe tu profesión" value={custom} onChangeText={setCustom} />
          {error ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e6 }}>
            <View style={{ flex: 1 }}><GhostButton title="Cancelar" onPress={onClose} disabled={busy} /></View>
            <View style={{ flex: 1.4 }}>
              <PrimaryButton title={busy ? 'Guardando…' : 'Guardar profesión'} onPress={() => save(custom.trim() || sel)} loading={busy} disabled={!custom.trim() && !sel} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Etiqueta humana del estado de un viaje activo. */
function activeTripLabel(status: string): string {
  if (status === 'requested') return 'BUSCANDO CONDUCTOR';
  if (status === 'in_progress') return 'VIAJE EN MARCHA';
  return 'CONDUCTOR EN CAMINO';
}

const tripCard = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1.5, padding: espaciado.e14, flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, marginTop: espaciado.e14 },
  iconBox: { width: 40, height: 40, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14.5, fontWeight: peso.titulo, marginTop: 1 },
  sub: { fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e2 },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  cover: { width: '100%', justifyContent: 'flex-end', overflow: 'hidden' },
  coverImg: { resizeMode: 'cover' },
  coverScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,14,24,0.22)' },
  coverScrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '72%', backgroundColor: 'rgba(8,14,24,0.50)' },
  coverActions: { position: 'absolute', left: 12, alignItems: 'flex-start', gap: espaciado.e8, zIndex: 6 },
  editCapsule: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e5, borderRadius: radios.full, backgroundColor: 'rgba(0,0,0,0.35)' },
  editCapsuleTxt: { color: brand.white, fontSize: tipografia.caption, fontWeight: peso.maximo },
  menuGhostBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  identityBlock: { paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e16 },
  identityTopRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 30, fontWeight: peso.titulo, color: brand.white, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 21, fontWeight: peso.titulo, color: brand.white, flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  egIdRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e3 },
  egId: { color: 'rgba(255,255,255,0.95)', fontSize: 10.5, fontWeight: peso.maximo, letterSpacing: 0.3 },
  qrMini: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginTop: espaciado.e2 },
  locTxt: { color: 'rgba(255,255,255,0.92)', fontSize: tipografia.micro, fontWeight: peso.medio },
  addStatusBtn: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, alignSelf: 'flex-start', borderRadius: radios.full, borderWidth: 1, paddingHorizontal: espaciado.e9, paddingVertical: 3.5, marginTop: espaciado.e6, backgroundColor: 'rgba(0,0,0,0.25)' },
  addStatusTxt: { color: 'rgba(255,255,255,0.95)', fontSize: 10.5, fontWeight: peso.maximo },

  statsRow: { flexDirection: 'row', gap: espaciado.e16, marginTop: espaciado.e10 },
  statItem: { alignItems: 'center', minWidth: 62 },
  statValue: { color: brand.white, fontSize: 15, fontWeight: peso.titulo },
  statLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 9.5, fontWeight: peso.fuerte, marginTop: 1 },
  ratingValueRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },

  bioTxt: { color: 'rgba(255,255,255,0.92)', fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e6, lineHeight: 16 },

  linksArea: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e5, marginTop: espaciado.e8 },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radios.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', paddingHorizontal: espaciado.e8, paddingVertical: 3.5, maxWidth: '92%' },
  linkChipTxt: { color: brand.white, fontSize: 10.5, fontWeight: peso.fuerte, maxWidth: 130 },
  // Chip de OCUPACIÓN: va el primero en la fila de correos/enlaces (delante).
  occupChip: { backgroundColor: 'rgba(255,209,102,0.22)' },

  lbTitleWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: espaciado.e18 },
  lbTitleCover: { fontSize: 26, fontWeight: peso.titulo, color: brand.white, letterSpacing: 0.3, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  publishCoverBtn: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, backgroundColor: 'rgba(255,255,255,0.24)', borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  publishCoverTxt: { color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo },

  body: { paddingHorizontal: espaciado.e18 },
  tabsRow: { flexDirection: 'row', gap: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: espaciado.e4 },
  tabItem: { paddingVertical: espaciado.e8 },
  tabTxt: { fontSize: tipografia.body },
  tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2 },

  lbEmpty: { borderRadius: radios.lg, borderWidth: StyleSheet.hairlineWidth, padding: espaciado.e16, marginTop: espaciado.e12, alignItems: 'center' },
  lbEmptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: espaciado.e8 },
  lbEmptyTitle: { fontSize: tipografia.body, fontWeight: peso.titulo, textAlign: 'center' },
  lbEmptyBody: { fontSize: tipografia.caption, fontWeight: peso.medio, textAlign: 'center', marginTop: espaciado.e4, lineHeight: 16 },
  lbActions: { flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8 },
  version: { textAlign: 'center', fontSize: tipografia.micro, marginTop: espaciado.e16, fontWeight: peso.medio },

  // Modales bottom-sheet
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: espaciado.e20, paddingBottom: 34, gap: espaciado.e12 },
  sheetCardTall: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: espaciado.e18, paddingBottom: 34, maxHeight: '88%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 17, fontWeight: peso.titulo },
  sheetSub: { fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e2 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e11, paddingHorizontal: espaciado.e4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' },
  pickRowTxt: { flex: 1, fontSize: tipografia.body, fontWeight: peso.medio },
  pickRowCode: { fontSize: tipografia.micro, fontWeight: peso.maximo },
  pickLabel: { fontSize: tipografia.caption, fontWeight: peso.maximo, marginTop: espaciado.e4 },
  cityChips: { gap: espaciado.e6 },
  cityChip: { borderRadius: radios.full, borderWidth: 1.2, paddingHorizontal: espaciado.e11, paddingVertical: espaciado.e6 },

  lbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e10, marginTop: espaciado.e12 },
  qrCard: { width: '86%', maxWidth: 340, borderRadius: 22, padding: espaciado.e18, alignItems: 'center' },
  qrSub: { fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e2, alignSelf: 'flex-start' },
  qrBox: { backgroundColor: brand.white, padding: espaciado.e12, borderRadius: 14, marginTop: espaciado.e14 },
  qrId: { fontSize: 15, fontWeight: peso.titulo, marginTop: espaciado.e12, letterSpacing: 0.5 },
  qrHint: { fontSize: tipografia.micro, fontWeight: peso.medio, marginTop: espaciado.e6, textAlign: 'center' },
  emptyCard: { width: '84%', maxWidth: 330, borderRadius: 22, padding: espaciado.e22, alignItems: 'center' },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: espaciado.e10 },
  emptyTitle: { fontSize: tipografia.subtitle, fontWeight: peso.titulo, textAlign: 'center' },
  emptyBody: { fontSize: tipografia.body, fontWeight: peso.medio, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 19 },
  emptyOk: { marginTop: espaciado.e16, borderRadius: radios.full, paddingHorizontal: espaciado.e26, paddingVertical: espaciado.e10 },
  emptyOkTxt: { color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.body },
  photoLg: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoLgImg: { width: '100%', height: '100%' },
  photoLgTxt: { fontSize: 40, fontWeight: peso.titulo },
  pickBtn: { flex: 1, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: espaciado.e12, minHeight: 44 },
  pickBusy: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 },
});


