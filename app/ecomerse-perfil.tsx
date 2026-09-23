/**
 * Perfil del Mercado — tercer destino del pie (`/ecomerse-perfil`).
 *
 * QUÉ ENTRA Y QUÉ NO
 * Se integra **sólo** lo que se pidió del perfil de referencia: la identidad con opción a editar, la
 * dirección, mis pedidos con sus cuatro secciones, los favoritos y los dos accesos de reclamación y
 * seguimiento. De las capturas **no** se traen cupones, tarjeta mensual, historial de navegación,
 * centro de recarga, 拼团中 (compras en grupo) ni niveles de fidelidad: son módulos que aquí no
 * existen y que nadie ha pedido. 拼团中 se cae por su propio peso —no hay compra en grupo en esta
 * app— y por eso las secciones son CUATRO y no cinco.
 *
 * LO QUE YA FUNCIONA SE ENLAZA, LO QUE NO, SE DICE
 * «Mis pedidos», «Favoritos», «Dirección de entrega» (Fase 2) y —desde la Fase 5— «Reembolsos y
 * devoluciones» existen y están probados (`/ecomerse-orders`, `/ecomerse-favorites`,
 * `/ecomerse-direcciones` y `/ecomerse-perfil-reembolsos`), así que se enlazan: esconder una pantalla
 * que funciona para aparentar un perfil completo sería lo contrario de útil. Lo único que sigue sin
 * nada detrás son las tiendas seguidas (Fase 6), y va en un bloque aparte que lo dice, en vez de
 * pintar una fila que no lleva a ningún sitio.
 *
 * LA FILA DE LA DIRECCIÓN DICE CUÁNTAS HAY
 * Su nota sale de la agenda de verdad (`ecomerse_addresses`), no de un texto fijo: si tienes tres
 * guardadas lo dice y nombra la predeterminada, y si no tienes ninguna lo dice también. Una fila
 * que siempre cuenta lo mismo da igual que no estar.
 *
 * LAS CUATRO SECCIONES VIENEN DE UN MÓDULO COMPARTIDO
 * Los rótulos y los estados de 待付款 · 打包中 · 待收货 · 评价 viven en
 * `components/ecomerse/seccionesCompra.ts`, que es también de donde salen los chips de
 * `/ecomerse-orders`. Aquí se pintan, allí se filtran: si cada uno guardara su copia, un día el
 * perfil diría una cosa y la lista filtraría otra. **El id de la sección es el que viaja en la URL
 * del enlace**, que es lo que garantiza que la ficha y la lista hablen del mismo grupo de pedidos.
 *
 * LA IDENTIDAD ES LA MISMA PERSONA
 * El avatar y el nombre salen de la cuenta (`/mobility/auth/me`), no de un perfil propio del
 * Mercado: quien compra es el mismo usuario que pide un taxi o publica en Life Book. Por eso
 * «editar» lleva al editor de perfil que ya existe y no a un formulario nuevo — dos sitios donde
 * cambiar la misma foto acabarían enseñando dos fotos distintas.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  ArrowLeft, ChevronRight, CreditCard, Heart, MapPin, Package, RotateCcw, Settings, Star, Store, Truck,
} from 'lucide-react-native';
import { brand, espaciado, icono, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { authApi, type MeProfile } from '../api/auth';
import { ecomerseApi, type EcomerseAddress, type EcomerseDisputeCounts } from '../api/ecomerse';
import { useSession } from '../state/session';
import PieDelMercado, { PIE_MERCADO_H } from '../components/ecomerse/PieDelMercado';
import { useSinLeerMercado } from '../components/ecomerse/useSinLeer';
import {
  SECCIONES_COMPRA, buscarSeccion, traerEntregadosSinResena,
  type EntregadosSinResena, type SeccionId,
} from '../components/ecomerse/seccionesCompra';

/** Una fila con destino. */
interface Acceso {
  titulo: string;
  nota: string;
  icono: React.ComponentType<{ size?: number; color?: string }>;
  ruta?: string;
}

/** Lo guardado: hoy solo favoritos. Las tiendas que sigo ya tienen su propia fila viva (abajo). */
const GUARDADO: Acceso[] = [
  {
    titulo: 'Favoritos',
    nota: 'Lo que has guardado, con sus categorías y cuántos hay en cada una.',
    icono: Heart,
    ruta: '/ecomerse-favorites',
  },
];

/**
 * El icono de cada sección. Va AQUÍ y no en el módulo compartido porque aquél es el CONTRATO (el id,
 * el rótulo y el estado) y esto es pintura: si mañana el perfil cambia de iconos, la lista de
 * pedidos no tiene por qué enterarse.
 */
const ICONO_SECCION: Record<SeccionId, React.ComponentType<{ size?: number; color?: string }>> = {
  pendiente: CreditCard,
  preparando: Package,
  enviado: Truck,
  valorar: Star,
};

export default function EcomersePerfilScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  /** Los sin leer, para la insignia de «Mensajes» del pie. Ver `useSinLeer.ts`. */
  const sinLeer = useSinLeerMercado();
  const [yo, setYo] = useState<MeProfile | null>(null);
  const [cargando, setCargando] = useState(false);
  /** Contadores por estado, para las tres primeras secciones. Una sola consulta agrupada. */
  const [cuenta, setCuenta] = useState<Record<string, number> | null>(null);
  /** Los entregados sin reseña (评价), que NO salen del contador del servidor. Ver el módulo. */
  const [valorar, setValorar] = useState<EntregadosSinResena | null>(null);
  /** La agenda de direcciones, para que su fila diga cuántas hay y cuál es la de por defecto. */
  const [direcciones, setDirecciones] = useState<EcomerseAddress[] | null>(null);
  /** Los recuentos de reclamaciones, para que la fila diga cuántas hay y cuántas siguen en revisión. */
  const [reclamos, setReclamos] = useState<EcomerseDisputeCounts | null>(null);
  /**
   * CUÁNTAS TIENDAS SIGUE el comprador (店铺关注). Solo hace falta el número: la fila nombra el
   * conteo y la lista vive en su propia pantalla. `null` significa «no se pudo preguntar», y entonces
   * la nota NO afirma un cero — el mismo criterio que la fila de reclamaciones.
   */
  const [nTiendas, setNTiendas] = useState<number | null>(null);
  /**
   * Si ya se PIDIÓ la carga alguna vez. Sin esto, entre el primer pintado y el efecto de foco —que
   * corre después— se colaba un fotograma diciendo «No se pudo cargar» antes de que la carga
   * hubiera empezado siquiera. «Aún no he preguntado» y «pregunté y falló» no son lo mismo.
   */
  const [intentado, setIntentado] = useState(false);

  const cargar = useCallback(async () => {
    if (!isAuthenticated) {
      setYo(null); setCuenta(null); setValorar(null); setDirecciones(null); setReclamos(null); setNTiendas(null); setIntentado(true); return;
    }
    setCargando(true);
    try {
      /* SEIS PREGUNTAS A LA VEZ, Y NINGUNA ARRASTRA A LAS OTRAS. Con `Promise.all` un fallo en la
         cabecera se llevaba por delante los contadores —y con ellos las cuatro secciones—, que es
         castigar lo que sí funcionaba por lo que no. Con `allSettled` cada una cae sola. */
      const [perfil, c, v, dir, rec, seg] = await Promise.allSettled([
        authApi.me(),
        ecomerseApi.orderCounts('buyer'),
        traerEntregadosSinResena(),
        ecomerseApi.addresses(),
        ecomerseApi.myDisputes(),
        ecomerseApi.myStoreFollows(),
      ]);
      setYo(perfil.status === 'fulfilled' ? perfil.value : null);
      setCuenta(c.status === 'fulfilled' ? c.value.porEstado : null);
      setValorar(v.status === 'fulfilled' ? v.value : null);
      setDirecciones(dir.status === 'fulfilled' ? dir.value : null);
      setReclamos(rec.status === 'fulfilled' ? rec.value.counts : null);
      setNTiendas(seg.status === 'fulfilled' ? seg.value.total : null);
    } finally {
      setCargando(false);
      setIntentado(true);
    }
  }, [isAuthenticated]);

  /**
   * CARGA AL ENTRAR EN FOCO, NO SÓLO AL MONTAR. La pantalla se queda MONTADA en la pila mientras
   * navegas —volver de la lista de pedidos no la reconstruye—, así que con un `useEffect` a secas
   * el perfil se quedaba con los contadores del día que lo abriste: comprabas, volvías, y seguía
   * diciendo «Por pagar 0». Con `useFocusEffect` se vuelve a preguntar cada vez que entra en foco.
   * Es el mismo patrón que ya usan las demás pantallas de lista del proyecto.
   */
  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  /**
   * Cuántos pedidos hay en una sección. `valorar` no sale de `cuenta` porque «sin reseña» no es un
   * estado del pedido —es la ausencia de fila en `ecomerse_reviews`— y el contador del servidor
   * agrupa por estado. Ver `seccionesCompra.ts`.
   */
  const nDe = (id: SeccionId): number => {
    if (id === 'valorar') return valorar?.n ?? 0;
    const s = buscarSeccion(id);
    if (!s) return 0;
    return s.estados.reduce((a, e) => a + (cuenta?.[e] ?? 0), 0);
  };

  const inicial = (yo?.fullName ?? '').trim().charAt(0).toUpperCase();
  /**
   * El teléfono llega de la base YA CON el `+` (`+240222000123`, que es como lo guarda `mobility.users`),
   * así que anteponerle otro pintaba «++240222000123». Se quita el que traiga y se pone uno solo.
   */
  const tel = yo?.phone ? `+${yo.phone.replace(/^\+/, '')}` : null;
  /** Se preguntó, ya no se está preguntando y no hay identidad: eso es un fallo, no una carga. */
  const fallo = isAuthenticated && intentado && !cargando && !yo;

  /**
   * La fila de la dirección. Su nota sale de la AGENDA, no de un texto fijo: una fila que siempre
   * cuenta lo mismo da igual que no estar. La predeterminada se nombra por su etiqueta («Casa») y,
   * cuando no tiene, por el principio de la dirección, recortado para que no rompa la fila.
   */
  const entrega: Acceso[] = useMemo(() => {
    const d = direcciones;
    const pred = d?.find((x) => x.isDefault) ?? d?.[0] ?? null;
    const larga = pred ? (pred.label?.trim() || pred.detail) : '';
    const corta = larga.length > 30 ? `${larga.slice(0, 29)}…` : larga;
    return [
      {
        titulo: 'Dirección de entrega',
        nota:
          d === null
            ? 'Dónde quieres recibir tus pedidos.'
            : d.length === 0
              ? 'Todavía no tienes ninguna. Añádela y el checkout dejará de pedirte que la escribas.'
              : `${d.length} ${d.length === 1 ? 'guardada' : 'guardadas'} · por defecto: ${corta}`,
        icono: MapPin,
        ruta: '/ecomerse-direcciones',
      },
    ];
  }, [direcciones]);

  /**
   * La fila de reclamaciones. Su nota sale de la lista de VERDAD, con el mismo criterio que la de la
   * dirección: una fila que siempre cuenta lo mismo da igual que no estar. Nombra primero lo que pide
   * acción —las que siguen sin resolver— y después el total, que es el orden en que se leen.
   *
   * `reclamos === null` significa «no se pudo preguntar», y entonces la nota NO afirma un cero: dice
   * lo que hay detrás. Un «0 reclamaciones» al lado de un fallo de red es una mentira con buena
   * presentación.
   */
  const reembolsos: Acceso[] = useMemo(() => {
    const r = reclamos;
    const total = r ? r.pending + r.refunded + r.rejected : 0;
    const nota =
      r === null
        ? 'Las reclamaciones que has abierto y cómo acabaron.'
        : total === 0
          ? 'Todavía no has reclamado nada. Se abre una desde la ficha de un pedido entregado.'
          : r.pending > 0
            ? `${total} ${total === 1 ? 'reclamación' : 'reclamaciones'} · ${r.pending} en revisión`
            : `${total} ${total === 1 ? 'reclamación' : 'reclamaciones'} · ninguna en revisión`;
    return [
      {
        titulo: 'Reembolsos y devoluciones',
        nota,
        icono: RotateCcw,
        ruta: '/ecomerse-perfil-reembolsos',
      },
    ];
  }, [reclamos]);

  /**
   * La fila de las tiendas que sigo (店铺关注). La Fase 1 la dejó muerta —su nota decía «Todavía no
   * se puede seguir una tienda del Mercado»— porque entonces era la verdad: no había dónde guardar
   * un seguimiento. La Fase 6 construyó ese sitio (`wallet.ecomerse_store_follows`) y esta fila pasa
   * a ser viva, con el mismo criterio que las de arriba: el contador sale del servidor, y cuando no
   * se pudo preguntar la nota no afirma un cero.
   */
  const tiendasQueSigo: Acceso[] = useMemo(() => {
    const nota =
      nTiendas === null
        ? 'Las tiendas del Mercado que sigues, juntas en un sitio.'
        : nTiendas === 0
          ? 'Todavía no sigues ninguna. Se sigue desde la página de cada tienda.'
          : `${nTiendas} ${nTiendas === 1 ? 'tienda' : 'tiendas'}`;
    return [
      {
        titulo: 'Tiendas que sigo',
        nota,
        icono: Store,
        ruta: '/ecomerse-perfil-tiendas',
      },
    ];
  }, [nTiendas]);

  return (
    <View style={[styles.raiz, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[styles.cabecera, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ArrowLeft size={icono.lg} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.cabeceraTitulo, { color: colors.textPrimary }]}>Perfil</Text>
        <Pressable
          onPress={() => router.push('/edit-profile' as never)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Editar perfil"
        >
          <Settings size={icono.lg} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: PIE_MERCADO_H + insets.bottom + espaciado.e24 }}>
        {/* Identidad */}
        <View style={styles.identidad}>
          <View style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {yo?.avatarUrl ? (
              <Image source={{ uri: yo.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Text style={[styles.avatarLetra, { color: colors.textSecondary }]}>{inicial || '?'}</Text>
            )}
          </View>
          <View style={styles.identidadTexto}>
            <Text style={[styles.nombre, { color: colors.textPrimary }]} numberOfLines={1}>
              {yo?.fullName?.trim() || (isAuthenticated ? 'Tu cuenta' : 'Sin sesión')}
            </Text>
            {/*
              EL SUBTÍTULO NO PUEDE DECIR «Cargando…» CUANDO YA NO SE ESTÁ CARGANDO NADA. Antes era
              `yo?.phone ? tel : isAuthenticated ? 'Cargando tus datos…' : …`, y con eso, si la
              consulta fallaba —lo típico es abrir la app antes de que el aparato tenga red, que es
              justo lo que pasó en la primera prueba—, la frase se quedaba ahí PARA SIEMPRE: el
              perfil parecía estar cargando eternamente en vez de decir que había fallado. Se
              distinguen los tres estados reales, y el de fallo se puede reintentar.
            */}
            {tel ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>{tel}</Text>
            ) : fallo ? (
              <Pressable
                onPress={() => void cargar()}
                accessibilityRole="button"
                accessibilityLabel="Reintentar la carga del perfil"
              >
                <Text style={[styles.sub, { color: colors.primary }]} numberOfLines={1}>
                  No se pudo cargar. Toca para reintentar
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
                {isAuthenticated ? 'Cargando tus datos…' : 'Inicia sesión para ver tus pedidos'}
              </Text>
            )}
          </View>
          {cargando && <ActivityIndicator size="small" color={colors.primary} />}
          {!isAuthenticated && (
            <Pressable
              onPress={() => router.push('/auth' as never)}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
              style={[styles.entrar, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.entrarTexto}>Entrar</Text>
            </Pressable>
          )}
        </View>

        {/*
          MIS PEDIDOS, CON SUS CUATRO SECCIONES. Es lo que en la referencia ocupa la fila de 我的订单
          (imagen #4): no un enlace a «todos mis pedidos» sino CUATRO puertas, cada una con lo que
          hay dentro, porque «mis pedidos» no es una lista, son cuatro preguntas distintas. Cada
          ficha lleva al MISMO sitio con el filtro ya puesto, y ese id sale del módulo compartido.
        */}
        <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.tarjetaCabecera}>
            <Text style={[styles.tarjetaTitulo, { color: colors.textPrimary }]}>Mis pedidos</Text>
            <Pressable
              onPress={() => router.push('/ecomerse-orders' as never)}
              accessibilityRole="button"
              accessibilityLabel="Ver todos los pedidos"
              style={({ pressed }) => [styles.verTodos, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.verTodosTexto, { color: colors.primary }]}>Ver todos</Text>
              <ChevronRight size={icono.sm} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.secciones}>
            {SECCIONES_COMPRA.map((s) => {
              const Icono = ICONO_SECCION[s.id];
              const n = nDe(s.id);
              /* El contador del «Por valorar» puede venir SATURADO (el tope de una página de
                 `myOrders`): se dice con un «+» en vez de enseñar un número que parece exacto. */
              const saturado = s.id === 'valorar' && valorar?.truncado === true && n > 0;
              const cifra = n > 99 ? '99+' : `${n}${saturado ? '+' : ''}`;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => router.push(`/ecomerse-orders?filtro=${s.id}` as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.label}: ${n ? `${saturado ? 'más de ' : ''}${n} ${n === 1 ? 'pedido' : 'pedidos'}` : 'ninguno'}. Abre la lista filtrada.`}
                  style={({ pressed }) => [styles.seccion, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <View>
                    <Icono size={icono.lg} color={colors.textPrimary} />
                    {n > 0 && (
                      <View style={[styles.globo, { borderColor: colors.card }]}>
                        <Text style={styles.globoTexto}>{cifra}</Text>
                      </View>
                    )}
                  </View>
                  {/* Dos líneas: «En preparación» no cabe en una a este ancho y partirlo a la mitad
                      («En prepa-/ración») es peor que dejarlo bajar entero. */}
                  <Text style={[styles.seccionLabel, { color: colors.textSecondary }]} numberOfLines={2}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Bloque titulo="Entrega" accesos={entrega} onIr={(r) => router.push(r as never)} />
        {/* Va antes que «Guardado»: una reclamación abierta es algo que pide atención, y lo que pide
            atención no se pone debajo de lo que se guarda. */}
        <Bloque titulo="Reclamaciones" accesos={reembolsos} onIr={(r) => router.push(r as never)} />
        <Bloque titulo="Guardado" accesos={GUARDADO} onIr={(r) => router.push(r as never)} />
        {/* Después de «Guardado»: seguir una tienda es otra forma de quedarse con ella, junto a los
            favoritos. La fila era la última muerta del perfil; con la Fase 6 pasa a la lista viva. */}
        <Bloque titulo="Tiendas" accesos={tiendasQueSigo} onIr={(r) => router.push(r as never)} />
      </ScrollView>

      <PieDelMercado sinLeer={sinLeer} />
    </View>
  );
}

function Bloque({
  titulo,
  accesos,
  onIr,
}: {
  titulo: string;
  accesos: Acceso[];
  onIr?: (ruta: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.bloque}>
      <Text style={[styles.bloqueTitulo, { color: colors.textPrimary }]}>{titulo}</Text>
      {accesos.map((a) => {
        const Icono = a.icono;
        const vivo = !!a.ruta && !!onIr;
        const contenido = (
          <>
            <View style={[styles.filaIcono, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icono size={icono.sm} color={vivo ? colors.primary : colors.textSecondary} />
            </View>
            <View style={styles.filaTexto}>
              <Text style={[styles.filaTitulo, { color: colors.textPrimary }]}>{a.titulo}</Text>
              <Text style={[styles.filaNota, { color: colors.textSecondary }]}>{a.nota}</Text>
            </View>
            {vivo && <ChevronRight size={icono.sm} color={colors.textSecondary} />}
          </>
        );
        return vivo ? (
          <Pressable
            key={a.titulo}
            onPress={() => onIr!(a.ruta!)}
            accessibilityRole="button"
            accessibilityLabel={a.titulo}
            style={({ pressed }) => [styles.fila, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            {contenido}
          </Pressable>
        ) : (
          <View key={a.titulo} style={[styles.fila, { borderTopColor: colors.border }]}>
            {contenido}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino,
  },
  cabeceraTitulo: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  identidad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e12,
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radios.full,
    borderWidth: trazo.fino,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetra: { fontSize: tipografia.title, fontWeight: peso.titulo },
  identidadTexto: { flex: 1 },
  nombre: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  sub: { fontSize: tipografia.caption, marginTop: espaciado.e4 },
  entrar: {
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e8,
    borderRadius: radios.full,
  },
  entrarTexto: { color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo },
  /* La tarjeta de los pedidos: mismo cromo que las tarjetas del Mercado —`colors.card`, un borde
     fino y una sombra— para que el perfil no parezca de otra app. */
  tarjeta: {
    marginHorizontal: espaciado.e16,
    borderRadius: radios.lg,
    borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
  },
  tarjetaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tarjetaTitulo: { fontSize: tipografia.body, fontWeight: peso.titulo },
  verTodos: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 / 2 },
  verTodosTexto: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  secciones: {
    flexDirection: 'row',
    marginTop: espaciado.e16,
    marginBottom: espaciado.e8,
  },
  seccion: { flex: 1, alignItems: 'center', gap: espaciado.e8 },
  seccionLabel: { fontSize: tipografia.micro, textAlign: 'center' },
  /* El globo del contador. El aro sale del TEMA (`colors.card`, el color real de la tarjeta) y no de
     `brand.white`: así se despega del icono tanto en claro como en oscuro, que es el fallo que ya se
     corrigió en `PieDelMercado.tsx`. */
  globo: {
    position: 'absolute',
    top: -espaciado.e8,
    right: -espaciado.e8,
    backgroundColor: brand.like,
    borderRadius: radios.full,
    minWidth: espaciado.e16,
    height: espaciado.e16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: trazo.base,
    paddingHorizontal: espaciado.e4,
  },
  globoTexto: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.titulo },
  bloque: { paddingHorizontal: espaciado.e16, marginTop: espaciado.e16 },
  bloqueTitulo: { fontSize: tipografia.body, fontWeight: peso.titulo, marginBottom: espaciado.e8 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e12,
    paddingVertical: espaciado.e12,
    borderTopWidth: trazo.fino,
  },
  filaIcono: {
    width: 36,
    height: 36,
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaTexto: { flex: 1 },
  filaTitulo: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  filaNota: { fontSize: tipografia.caption, marginTop: espaciado.e4 },
});
