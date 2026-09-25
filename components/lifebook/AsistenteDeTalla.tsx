/**
 * components/lifebook/AsistenteDeTalla.tsx — «¿NO SABES TU TALLA?» (tanda L).
 *
 * QUÉ RESUELVE. El comerciante ya puede escribir su tabla de tallas (tanda J) y el comprador ya
 * elige talla y color (tanda K), pero **nadie usaba la tabla**: para saber la talla había que
 * adivinar. Aquí se comparan TUS medidas con la tabla DE ESE PRODUCTO y se dice la talla, POR QUÉ y
 * con qué ajuste. Es exactamente lo que hace el servidor (`POST products/:id/size-suggestion`).
 *
 * TRES REGLAS QUE NO SE ROMPEN:
 *   1. **No se inventa nada.** Si esa tienda no ha configurado tabla (o no hay para ese sexo y ese
 *      tipo de prenda), se dice y se acabó: no hay talla «aproximada».
 *   2. **Las medidas no salen de la cuenta.** Solo se guardan si tú lo pides, y la tienda nunca las
 *      ve: lo único que viaja en el pedido es la talla elegida.
 *   3. **La talla la eliges tú.** La recomendación es una sugerencia con su razón; «Usar esta talla»
 *      la marca, pero puedes poner otra.
 *
 * Las medidas de ropa y las del pie son **independientes** (como pidió el dueño): tener unas no
 * obliga a tener las otras.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { commerceApi, tallasApi, type LbMeasurements, type LbOptionGroup, type LbProduct, type LbSizeChart, type LbSizeKind, type LbSizeSuggestion } from '../../api/commerce';
import { NUMEROS_CALZADO, cmDeNumero, numeroDeCm } from '../../constants/tallas';
import { Chip, ChipRow } from './Chip';
import RuletaVertical, { rango } from './RuletaVertical';

/** La medida que DECIDE la talla en cada tipo de prenda (la misma tabla que usa el servidor). */
const PRINCIPAL: Record<LbSizeKind, keyof Medidas> = {
  top: 'altura', dress: 'altura', bottom: 'peso', shoes: 'pieLargo', accessory: 'altura', other: 'altura',
};

/**
 * LAS MEDIDAS QUE SE PIDEN — UN JUEGO ÚNICO (tandas L-bis y L-ter).
 *
 * El dueño lo dejó claro en dos pasos: «elimina las medidas de pecho, cintura, cadera» y «altura, peso
 * y el número de calzado van juntos, el guardado será juntos». Así que se piden **tres cosas y
 * siempre las tres**, se guardan de una vez y se leen de una vez: da igual si estás mirando una
 * camiseta o unas zapatillas, tus medidas son tuyas y son las mismas.
 *
 * El número de calzado se guarda en centímetros (el servidor y las tablas de las tiendas van en cm):
 * la equivalencia está en `constants/tallas.ts` y es la misma que usa el comerciante al publicar.
 *
 * El pecho, la cintura y la cadera siguen existiendo pero **empiezan en `null`** y no se piden: hay
 * tiendas cuya tabla mide así y entonces se ofrecen como opcionales. Si se mandaran con un valor por
 * defecto, el servidor los tomaría como si el cliente los hubiera dicho y la talla saldría de un
 * número inventado.
 */
interface Medidas {
  pecho: number | null; cintura: number | null; cadera: number | null;
  altura: number; peso: number;
  pieLargo: number;
}

const DE_FABRICA: Medidas = { pecho: null, cintura: null, cadera: null, altura: 168, peso: 65, pieLargo: 26 };

const nombreTipo = (k: LbSizeKind): string => ({
  top: 'parte de arriba', bottom: 'parte de abajo', dress: 'vestido', shoes: 'calzado', accessory: 'accesorio', other: 'prenda',
}[k]);

export default function AsistenteDeTalla({
  product, grupo, tablas: tablasDelPanel, onUsarTalla,
}: {
  product: LbProduct;
  /** El eje de tallas del producto (trae contra qué tabla se compara). */
  grupo: LbOptionGroup;
  /** Las tablas que ya cargó el panel; si no vienen, se piden aquí. */
  tablas?: LbSizeChart[];
  onUsarTalla: (talla: string) => void;
}) {
  const { colors } = useTheme();
  const tipo = (grupo.chartKind ?? 'top') as LbSizeKind;
  const esCalzado = tipo === 'shoes';

  const [tablas, setTablas] = useState<LbSizeChart[] | null>(tablasDelPanel ?? null);
  const [genero, setGenero] = useState<'women' | 'men'>('women');
  const [medidas, setMedidas] = useState<Medidas>(DE_FABRICA);
  const [deGuardadas, setDeGuardadas] = useState(false);
  const [resultado, setResultado] = useState<LbSizeSuggestion | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardadas, setGuardadas] = useState(false);
  /** Las medidas opcionales (pecho/cintura/cadera) están escondidas salvo que hagan falta. */
  const [verOpcionales, setVerOpcionales] = useState(false);
  /**
   * Mientras se desliza una ruleta, el scroll del panel se apaga: si no, en Android los dos scrolls
   * verticales se pelean y la medida no cambia (el fallo que se vio en el móvil).
   */
  const [arrastrando, setArrastrando] = useState(false);

  /** Las tablas del producto y mis medidas guardadas, en una sola carga. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      // Las tablas se piden solo si el panel no las tenía ya (evita dos veces la misma llamada).
      const [chart, mias] = await Promise.all([
        tablasDelPanel ? Promise.resolve({ charts: tablasDelPanel }) : commerceApi.sizeChart(product.id).catch(() => ({ charts: [] as LbSizeChart[] })),
        tallasApi.misMedidas().catch(() => ({ body: null, feet: null })),
      ]);
      if (!vivo) return;
      setTablas(chart.charts ?? []);
      /**
       * UN JUEGO ÚNICO: se lee la fila unificada (el servidor devuelve el mismo juego en `body` y en
       * `feet` desde el parche 69; `feet` queda como respaldo de datos antiguos).
       */
      const guardada: LbMeasurements | null = mias.body ?? mias.feet;
      if (guardada) {
        setDeGuardadas(true);
        if (guardada.gender) setGenero(guardada.gender);
        setMedidas((m) => ({
          pecho: guardada.chestCm ?? m.pecho,
          cintura: guardada.waistCm ?? m.cintura,
          cadera: guardada.hipCm ?? m.cadera,
          altura: guardada.heightCm ?? m.altura,
          peso: guardada.weightKg ?? m.peso,
          pieLargo: guardada.footLengthCm ?? m.pieLargo,
        }));
        if (guardada.chestCm || guardada.waistCm || guardada.hipCm) setVerOpcionales(true);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, tablasDelPanel]);

  /**
   * ¿Hay tabla para ESTE tipo y ESTE sexo? Se mira antes de enseñar las ruletas: si no la hay, no se
   * piden medidas para nada (y se dice por qué no se puede recomendar).
   */
  const tabla = useMemo(() => {
    const lista = tablas ?? [];
    return lista.find((c) => c.kind === tipo && c.gender === genero)
      ?? lista.find((c) => c.kind === tipo && c.gender === 'unisex')
      ?? null;
  }, [tablas, tipo, genero]);

  const principal = PRINCIPAL[tipo];
  const valorPrincipal = medidas[principal];

  const verMiTalla = async () => {
    setCalculando(true);
    setResultado(null);
    try {
      const r = await tallasApi.sugerir(product.id, {
        kind: tipo,
        gender: genero,
        heightCm: medidas.altura,
        weightKg: medidas.peso,
        /**
         * El número de calzado va SIEMPRE, aunque la prenda no sea calzado: las medidas son un juego
         * único y así el servidor tiene todo lo que sabe de ti. Para una camiseta simplemente no lo
         * usa (su tabla no lo declara).
         */
        footLengthCm: medidas.pieLargo,
        // Los opcionales, solo si el cliente los ha dado de verdad: `undefined` = «no lo sé».
        ...(medidas.pecho !== null ? { chestCm: medidas.pecho } : {}),
        ...(medidas.cintura !== null ? { waistCm: medidas.cintura } : {}),
        ...(medidas.cadera !== null ? { hipCm: medidas.cadera } : {}),
      });
      setResultado(r);
      /**
       * Si la tabla de la tienda mide por pecho/cintura/cadera (hay tiendas que publican así), el
       * servidor lo dice; entonces se enseñan esas medidas como opcionales en vez de dejar al
       * cliente en un «nos falta tu pecho» sin salida.
       */
      if (/nos falta tu (pecho|cintura|cadera)/i.test(r.reason)) setVerOpcionales(true);
    } catch (e) {
      Alert.alert('No se pudo calcular', e instanceof Error ? e.message : 'Inténtalo otra vez');
    } finally {
      setCalculando(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      /**
       * UN SOLO GUARDADO (petición del dueño): altura, peso y número de calzado van juntos. Se manda
       * sin categoría, así que el servidor lo guarda como un juego único.
       */
      await tallasApi.guardarMedidas({
        gender: genero,
        heightCm: medidas.altura,
        weightKg: medidas.peso,
        footLengthCm: medidas.pieLargo,
        ...(medidas.pecho !== null ? { chestCm: medidas.pecho } : {}),
        ...(medidas.cintura !== null ? { waistCm: medidas.cintura } : {}),
        ...(medidas.cadera !== null ? { hipCm: medidas.cadera } : {}),
      });
      setGuardadas(true);
      setDeGuardadas(true);
      Alert.alert('Guardadas', 'Tus medidas se guardan juntas (altura, peso y número de calzado). La próxima vez las usamos sin preguntarte. Solo las ves tú: la tienda nunca las recibe.');
    } catch (e) {
      Alert.alert('No se pudieron guardar', e instanceof Error ? e.message : 'Inténtalo otra vez');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = () => {
    Alert.alert('Borrar mis medidas', 'Se borran tus medidas (altura, peso y número de calzado). Dejarás de tenerlas guardadas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await tallasApi.borrarMedidas();
            setDeGuardadas(false);
            setGuardadas(false);
            setResultado(null);
          } catch (e) {
            Alert.alert('No se pudieron borrar', e instanceof Error ? e.message : 'Inténtalo otra vez');
          }
        },
      },
    ]);
  };

  /** ¿La talla recomendada está entre las tallas que vende el producto? */
  const tallaEnElProducto = (talla: string): string | null => {
    const v = (grupo.values ?? []).find((x) => x.value.trim().toLowerCase() === talla.trim().toLowerCase());
    return v ? v.value : null;
  };

  if (tablas === null) {
    return (
      <View style={{ paddingVertical: espaciado.e26, alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>Mirando la tabla de esta tienda…</Text>
      </View>
    );
  }

  if (!tabla) {
    return (
      <View>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo, marginBottom: espaciado.e6 }}>
          Esta tienda todavía no tiene tabla de tallas
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 18 }}>
          No hay tabla de {nombreTipo(tipo)} {tablas.length ? 'para esas medidas' : 'configurada para este producto'}, así que
          no podemos recomendarte una talla: inventárnosla sería peor que no decir nada. Puedes preguntarle a la tienda
          por el chat, o guiarte por las tallas que tiene el producto.
        </Text>
      </View>
    );
  }

  /**
   * Se sacan a constantes ANTES del JSX a propósito: dentro de una función de `onPress`, TypeScript
   * ya no conserva el estrechamiento de `resultado.size` (es una propiedad de estado) y se quejaba
   * de `string | null`. Con una constante el valor queda fijado y legible.
   */
  const tallaRecomendada: string | null = resultado?.size ?? null;
  const tallaEnEsteProducto: string | null = tallaRecomendada ? tallaEnElProducto(tallaRecomendada) : null;

  return (
    <View>
      {/**
       * LAS RULETAS CON SCROLL, PERO **LOS BOTONES SIEMPRE A LA VISTA**.
       *
       * Antes todo el asistente iba dentro del mismo scroll y «Ver mi talla» y «Guardar mis medidas»
       * quedaban por debajo del borde: el dueño lo dijo tal cual —«entre los tres no hay un botón
       * guardar, ni ajustar»—. Un botón al que hay que bajar deslizando, con ruletas dentro que
       * también se deslizan, en la práctica no existe. Así que el pie va FIJO, fuera del scroll.
       */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 250 }} nestedScrollEnabled scrollEnabled={!arrastrando}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo, marginBottom: espaciado.e10 }}>Tu talla</Text>

        {/* Sexo: las tablas son distintas, y si la de la tienda es unisex vale para los dos. */}
        <ChipRow>
          <Chip compact label="Mujer" active={genero === 'women'} onPress={() => { setGenero('women'); setResultado(null); }} />
          <Chip compact label="Hombre" active={genero === 'men'} onPress={() => { setGenero('men'); setResultado(null); }} />
        </ChipRow>

        <View style={styles.ruletas}>
          <RuletaVertical onArrastre={setArrastrando} etiqueta="Altura" sufijo="cm" valores={rango(130, 220)}
            valor={medidas.altura} onChange={(v) => { setMedidas((m) => ({ ...m, altura: v })); setResultado(null); }} />
          <RuletaVertical onArrastre={setArrastrando} etiqueta="Peso" sufijo="kg" valores={rango(30, 180)}
            valor={medidas.peso} onChange={(v) => { setMedidas((m) => ({ ...m, peso: v })); setResultado(null); }} />
          <RuletaVertical onArrastre={setArrastrando} etiqueta="Calzado" valores={NUMEROS_CALZADO}
            valor={numeroDeCm(medidas.pieLargo)}
            onChange={(v) => { setMedidas((m) => ({ ...m, pieLargo: cmDeNumero(v) })); setResultado(null); }} />
          {verOpcionales ? (
            <>
              <RuletaVertical onArrastre={setArrastrando} etiqueta="Pecho" sufijo="cm" valores={rango(60, 150)}
                valor={medidas.pecho ?? 92} onChange={(v) => { setMedidas((m) => ({ ...m, pecho: v })); setResultado(null); }} />
              <RuletaVertical onArrastre={setArrastrando} etiqueta="Cintura" sufijo="cm" valores={rango(50, 140)}
                valor={medidas.cintura ?? 78} onChange={(v) => { setMedidas((m) => ({ ...m, cintura: v })); setResultado(null); }} />
              <RuletaVertical onArrastre={setArrastrando} etiqueta="Cadera" sufijo="cm" valores={rango(60, 150)}
                valor={medidas.cadera ?? 96} onChange={(v) => { setMedidas((m) => ({ ...m, cadera: v })); setResultado(null); }} />
            </>
          ) : null}
        </View>

        {!verOpcionales ? (
          <Pressable onPress={() => setVerOpcionales(true)} accessibilityLabel="Añadir pecho, cintura o cadera" style={{ marginTop: espaciado.e8 }}>
            <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>+ Pecho · Cintura · Cadera</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/**
       * PIE FIJO: el resultado y los dos botones, sin scroll de por medio.
       *   · «Ajustar mi talla» → calcula la recomendación con la tabla de la tienda.
       *   · «Guardar mis medidas» → guarda altura, peso y número juntos.
       */}
      {resultado ? (
        <View style={[styles.tarjeta, {
          borderColor: resultado.size ? colors.success : colors.danger,
          backgroundColor: alpha(resultado.size ? colors.success : colors.danger, 0.08),
        }]}>
          {tallaRecomendada ? (
            <>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo }}>
                Tu talla: {tallaRecomendada}{resultado?.fit ? ` · ajuste ${resultado.fit}` : ''}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginTop: espaciado.e4 }}>{resultado?.reason}</Text>
              {tallaEnEsteProducto ? (
                <Pressable
                  onPress={() => onUsarTalla(tallaEnEsteProducto)}
                  accessibilityLabel={`Usar la talla ${tallaRecomendada}`}
                  style={[styles.usar, { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.titulo }}>Usar esta talla</Text>
                </Pressable>
              ) : (
                <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.maximo, marginTop: espaciado.e8 }}>
                  La tabla recomienda la {tallaRecomendada}, pero este producto no la tiene entre sus tallas. Elige la más cercana.
                </Text>
              )}
            </>
          ) : (
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, lineHeight: 18, fontWeight: peso.fuerte }}>{resultado?.reason}</Text>
          )}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e10 }}>
        <Pressable
          onPress={() => { if (!calculando) void verMiTalla(); }}
          disabled={calculando}
          accessibilityLabel="Ajustar mi talla"
          style={[styles.botonPie, { flex: 1.3, backgroundColor: calculando ? alpha(colors.primary, 0.5) : colors.primary }]}
        >
          {calculando
            ? <ActivityIndicator size="small" color={brand.white} />
            : <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.titulo }}>Ajustar mi talla</Text>}
        </Pressable>
        <Pressable
          onPress={() => { if (!guardando && !guardadas) void guardar(); }}
          disabled={guardando || guardadas}
          accessibilityLabel="Guardar mis medidas"
          style={[styles.botonPie, { flex: 1, borderWidth: trazo.base, borderColor: colors.primary }]}
        >
          {guardando
            ? <ActivityIndicator size="small" color={colors.primary} />
            : (
              <Text numberOfLines={1} style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
                {guardadas ? 'Guardadas ✓' : 'Guardar medidas'}
              </Text>
            )}
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: espaciado.e6, gap: espaciado.e10 }}>
        {deGuardadas ? (
          <Pressable onPress={borrar} accessibilityLabel="Borrar mis medidas">
            <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Borrar mis medidas</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ruletas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e10, marginTop: espaciado.e12, marginBottom: espaciado.e4 },
  tarjeta: { borderWidth: trazo.base, borderRadius: radios.md, padding: espaciado.e11, marginTop: espaciado.e12 },
  usar: { marginTop: espaciado.e10, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  /** Los botones del pie fijo: la misma altura que los del panel, para que la fila cuadre. */
  botonPie: { height: 46, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e10 },
});
