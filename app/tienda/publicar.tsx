/**
 * Publicar — el formulario de alta y corrección de un anuncio, DENTRO de la zona del comerciante.
 *
 * Es el mismo formulario de seis secciones que ya estaba probado (v3 de la auditoría completa:
 * fotos como archivo multipart, cupo de plan, KYC, teléfono de GQ validado, subcategoría y foto
 * obligatorias, vista previa del precio, documentación, plazo y devoluciones). Lo que cambia el
 * 20-sep-2026 es DÓNDE vive y QUÉ YA NO HACE:
 *
 *  · Antes era la pantalla entera de «Mi tienda» (`/ecomerse-seller`, 1.110 líneas): requisitos +
 *    datos del negocio + formulario + lista de productos + banner de plan, todo en una.
 *  · Ahora es **una pantalla de la zona**, fuera de la barra (es un flujo de captura, no una
 *    pestaña). Los datos del negocio y el KYC viven en «Tienda», la lista de anuncios en «Anuncios»,
 *    y el plan también en «Tienda». Aquí solo se publica o se corrige.
 *
 * Entradas: desde «Anuncios» con el FAB, o con `?id=` para corregir un anuncio rechazado
 * (el backend solo admite editar en `draft` o `rejected`: `ecomerse.service.ts:425-426`).
 *
 * NOTA DE NUMERACIÓN: el formulario se llamaba «de seis secciones» contando la 1 como los datos del
 * vendedor. Esa sección ya no está aquí, así que las visibles se renumeran 1→5
 * (1 Producto · 2 Fotos · 3 Documentación · 4 Entrega · 5 Condiciones). Los comentarios `Sección N`
 * del fichero siguen la numeración nueva.
 * Ruta: /tienda/publicar
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, X } from 'lucide-react-native';
import { alpha, brand, espaciado, FormField, GhostButton, ilustracion, peso, Precio, PrimaryButton, radios, Sheet, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { ecomerseApi, EcomerseCategory, EcomerseProduct, EcomerseSellerMe, EcomerseShopPlan } from '../../api/ecomerse';
import { formatXAF } from '../../utils/formatHelpers';
import { CITIES } from '../../constants/data';

const STATUS_LABEL: Record<string, string> = {
  pending: 'En revisión', active: 'Activo', rejected: 'Rechazado',
  suspended: 'Suspendida', banned: 'Bloqueada', paused: 'Pausada', draft: 'Borrador', sold_out: 'Agotado',
};
const MAX_PHOTO_MB = 8;

/** Precio con formato local ("12.500", "12 500", "12500") → entero XAF. */
function parsePrice(s: string): number | null {
  const clean = s.replace(/[^\d]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 && n <= 100_000_000 ? n : null;
}

/**
 * ESTADO DEL ARTÍCULO — vocabulario fijo, no texto libre.
 *
 * Por qué una lista cerrada: si cada vendedor escribe «usado», «poco uso» o «buen estado», el
 * comprador no puede comparar dos anuncios ni filtrar, y la ficha no puede tener un dato fiable.
 * Cuatro opciones cubren el mercado de segunda mano sin ambigüedad, y `estado` viaja en
 * `attributes` (el backend ya lo acepta: `ecomerse.dto.ts:32`).
 */
const ESTADOS = ['Nuevo', 'Como nuevo', 'Buen estado', 'Para piezas'] as const;
type EstadoArticulo = (typeof ESTADOS)[number];

/** Mínimo de fotos por anuncio (antes 1). El tope del formulario sigue siendo 6. */
const MIN_FOTOS = 3;

/**
 * PLAZO DE PREPARACIÓN (tanda 4 · sección 4). Cuánto tarda el vendedor en entregar el pedido.
 * Es un dato que el comprador necesita para saber cuándo esperar, y que hoy no existía.
 */
const PLAZOS = [
  { horas: 24, label: 'En 24 h' },
  { horas: 48, label: 'En 48 h' },
  { horas: 72, label: 'En 72 h' },
] as const;

/**
 * DOCUMENTACIÓN (tanda 4 · sección 3). Los tres tipos que admite el CHECK de la tabla
 * `wallet.ecomerse_product_docs` — tiene que coincidir con él, o el insert daría un 23514.
 * La factura es la única que tiene sentido comprobar contra el anuncio (importe y fecha);
 * por eso solo esa los pide.
 */
const DOCS = [
  { id: 'factura_compra', label: 'Factura de compra', pideDatos: true },
  { id: 'certificado_autenticidad', label: 'Certificado de autenticidad', pideDatos: false },
  { id: 'autorizacion_marca', label: 'Autorización de marca', pideDatos: false },
] as const;
type DocTipo = (typeof DOCS)[number]['id'];

/**
 * FORMAS DE ENTREGA que el vendedor acepta. La logística del Mercado ya existe y se elige en el
 * CHECKOUT (entrega directa del vendedor sin coste, o agente de la plataforma con tarifa por zona
 * — `ecomerse_delivery_zones`: 300 XAF + 50/km en zona céntrica), pero **el vendedor no opinaba**:
 * un anuncio podía acabar en un reparto que quien vende no ofrece. Ahora lo declara al publicar y
 * se guarda en `attributes.entrega`, que es `jsonb`: no hace falta tocar el esquema.
 */
const ENTREGAS = [
  { id: 'seller', label: 'Entrego yo', hint: 'Quedas con el comprador. Sin coste de envío.' },
  { id: 'agent', label: 'Con agente', hint: 'Un agente de la plataforma recoge y entrega. El comprador paga la tarifa de su zona.' },
  { id: 'both', label: 'Las dos', hint: 'El comprador elige al pagar.' },
] as const;
type FormaEntrega = (typeof ENTREGAS)[number]['id'];

export default function PublicarAnuncioScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /** `?id=` → corregir un anuncio rechazado. Sin `id`, se publica uno nuevo. */
  const { id: idCorregir } = useLocalSearchParams<{ id?: string }>();
  const [me, setMe] = useState<EcomerseSellerMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ciudad por defecto del anuncio: la del negocio (los datos del negocio viven en «Tienda»). */
  const [city, setCity] = useState('');
  const [busyPub, setBusyPub] = useState(false);
  const busyRef = useRef(false);
  const [cityModal, setCityModal] = useState<'prod' | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [pTitle, setPTitle] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pCity, setPCity] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pStock, setPStock] = useState('1');
  const [cats, setCats] = useState<EcomerseCategory[]>([]);
  const [shopPlan, setShopPlan] = useState<EcomerseShopPlan | null>(null);
  /* LOS TRES NIVELES, un estado cada uno. `pCatId` conserva su nombre porque la pantalla ya lo usaba
     para «el nivel de arriba», y ese papel lo hace ahora el DEPARTAMENTO. `pFamId` es el nuevo (la
     FAMILIA) y `pSubId` —el que ya existía— pasa a ser la HOJA, el último nivel y donde de verdad
     vive un anuncio. Renombrar los tres costaría 40 líneas para el mismo comportamiento; se dejan
     como están y se dice aquí qué es cada uno. */
  const [pCatId, setPCatId] = useState('');
  const [pFamId, setPFamId] = useState('');
  const [pSubId, setPSubId] = useState('');
  const [pPhotos, setPPhotos] = useState<string[]>([]);
  /** Estado del artículo (obligatorio). Se envía como `attributes.estado`. */
  const [pEstado, setPEstado] = useState<EstadoArticulo | ''>('');
  /* --- Sección 1: información del producto (atributos que el comprador usa para decidir) --- */
  const [pMarca, setPMarca] = useState('');
  const [pModelo, setPModelo] = useState('');
  const [pSku, setPSku] = useState('');
  const [pTalla, setPTalla] = useState('');
  const [pColor, setPColor] = useState('');
  /** Acepta ofertas por debajo del precio. Antes era `is_negotiable` con `default true` y sin control:
   *  el vendedor veía «💰 Negociable» en su anuncio sin haberlo elegido nunca. */
  const [pNegociable, setPNegociable] = useState(true);
  /* --- Sección 4: configuración logística --- */
  const [pEntrega, setPEntrega] = useState<FormaEntrega | ''>('');
  /** Plazo de preparación en horas (24/48/72). Columna `handling_hours` desde la migración 019. */
  const [pPlazo, setPPlazo] = useState<number>(24);
  /** Devoluciones que ofrece el VENDEDOR, distinto de la garantía de 7 días de la plataforma. */
  const [pDevoluciones, setPDevoluciones] = useState(false);
  /* --- Sección 3: documentación --- */
  const [pDocTipo, setPDocTipo] = useState<DocTipo | ''>('');
  const [pDocNumero, setPDocNumero] = useState('');
  const [pDocImporte, setPDocImporte] = useState('');
  const [pDocFecha, setPDocFecha] = useState('');
  const [pDocFoto, setPDocFoto] = useState<string | null>(null);
  /** Documentos ya guardados del anuncio que se edita (se conservan si no se tocan). */
  const [pDocs, setPDocs] = useState<{ docType: DocTipo; url: string; docNumber?: string; amountXaf?: number; issuedOn?: string }[]>([]);
  /* --- Sección 5: términos --- */
  const [pAceptaTerminos, setPAceptaTerminos] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pUploading, setPUploading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  /** Fotos como ARCHIVO (multipart → MinIO), sin base64 en el JSON. */
  const pickPhotos = async (source: 'camera' | 'library') => {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso', source === 'camera' ? 'Necesitamos acceso a la cámara.' : 'Necesitamos acceso a tu galería.');
        return;
      }
      const res = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 4, quality: 0.7 });
      if (res.canceled || !res.assets?.length) return;
      const toAdd = res.assets.slice(0, 6 - pPhotos.length);
      setPUploading(true);
      const urls: string[] = [];
      for (const a of toAdd) {
        if ((a.fileSize ?? 0) > MAX_PHOTO_MB * 1024 * 1024) continue;
        try {
          const form = new FormData();
          form.append('photo', { uri: a.uri, name: `foto-${Date.now()}.jpg`, type: a.mimeType ?? 'image/jpeg' } as unknown as Blob);
          const r = await ecomerseApi.uploadPhoto(form);
          if (r.url) urls.push(r.url);
        } catch { /* una foto falló; seguimos con las demás */ }
      }
      if (urls.length) {
        setPPhotos((prev) => [...prev, ...urls].slice(0, 6));
      } else if (toAdd.length) {
        Alert.alert('Fotos', 'No se pudieron subir las fotos. Prueba con imágenes de menos de 8 MB.');
      }
    } catch { /* picker falló */ }
    finally { setPUploading(false); }
  };

  const pickSource = () => {
    Alert.alert('Añadir fotos', 'Elige el origen:', [
      { text: 'Cámara', onPress: () => pickPhotos('camera') },
      { text: 'Galería', onPress: () => pickPhotos('library') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await ecomerseApi.sellerMe();
      setMe(m);
      if (m.seller) setCity(m.seller.city);
      const c = await ecomerseApi.categories();
      setCats(c);
      ecomerseApi.shopPlan().then(setShopPlan).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar tu tienda. Revisa la conexión.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const atQuota = !!shopPlan && shopPlan.limit > 0 && shopPlan.used >= shopPlan.limit;

  /**
   * Un solo sitio para vaciar el formulario. Antes la limpieza estaba escrita tres veces (al
   * publicar, al cancelar la edición y en el botón de cancelar) y con nueve campos ya era fácil
   * olvidarse de uno: ahora hay un único camino y los campos nuevos se añaden aquí.
   */
  const limpiarFormulario = useCallback(() => {
    setEditId(null);
    setPTitle(''); setPPrice(''); setPDesc(''); setPCatId(''); setPFamId(''); setPSubId('');
    setPPhotos([]); setPStock('1'); setPEstado('');
    setPMarca(''); setPModelo(''); setPSku(''); setPTalla(''); setPColor('');
    setPNegociable(true); setPEntrega(''); setPAceptaTerminos(false); setPreview(false);
    setPPlazo(24); setPDevoluciones(false);
    setPDocTipo(''); setPDocNumero(''); setPDocImporte(''); setPDocFecha(''); setPDocFoto(null); setPDocs([]);
  }, []);

  /**
   * Documentos que se envían al guardar: los que ya tenía el anuncio más el que se acaba de
   * adjuntar (sustituyendo al del mismo tipo, porque la tabla tiene UNIQUE (product_id, doc_type)).
   *
   * Decisión de diseño: se adjunta de uno en uno y con vista previa, en vez de una lista múltiple.
   * Con seis fotos y tres documentos en el mismo formulario, una subida múltiple silenciosa es
   * justo donde se pierde un archivo sin que nadie se entere; aquí el vendedor ve qué va a enviar.
   */
  const docsParaEnviar = useMemo(() => {
    const base = pDocs.filter((d) => d.docType !== pDocTipo || !pDocFoto);
    if (!pDocTipo || !pDocFoto) return base;
    const importe = Number(pDocImporte.replace(/[^\d]/g, ''));
    return [...base, {
      docType: pDocTipo,
      url: pDocFoto,
      ...(pDocNumero.trim() ? { docNumber: pDocNumero.trim() } : {}),
      ...(Number.isFinite(importe) && importe > 0 ? { amountXaf: importe } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(pDocFecha.trim()) ? { issuedOn: pDocFecha.trim() } : {}),
    }];
  }, [pDocs, pDocTipo, pDocFoto, pDocNumero, pDocImporte, pDocFecha]);

  /** Adjunta el documento: se guarda en memoria y se envía al publicar (el anuncio aún no existe si es nuevo). */
  const adjuntarDoc = async (origen: 'camera' | 'library') => {
    if (!pDocTipo) { Alert.alert('Tipo de documento', 'Elige primero qué documento vas a adjuntar.'); return; }
    try {
      const perm = origen === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permiso', 'Necesitamos acceso para adjuntar el documento.'); return; }
      const res = origen === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if ((a.fileSize ?? 0) > MAX_PHOTO_MB * 1024 * 1024) {
        Alert.alert('Documento', `La imagen pasa de ${MAX_PHOTO_MB} MB. Prueba con una foto más ligera.`);
        return;
      }
      /* Se sube YA (igual que las fotos) para que el vendedor vea si falló. Si la subida falla, no
         se guarda nada: mejor decir «no se pudo» que publicar un anuncio con un documento roto. */
      setPUploading(true);
      const form = new FormData();
      form.append('photo', { uri: a.uri, name: `doc-${Date.now()}.jpg`, type: a.mimeType ?? 'image/jpeg' } as unknown as Blob);
      const r = await ecomerseApi.uploadPhoto(form);
      if (!r.url) { Alert.alert('Documento', 'No se pudo subir el documento. Inténtalo de nuevo.'); return; }
      setPDocFoto(r.url);
    } catch {
      Alert.alert('Documento', 'No se pudo adjuntar el documento.');
    } finally { setPUploading(false); }
  };

  /** Publica o reenvía la corrección (validación completa + cupo). */
  const saveProduct = async () => {
    if (busyRef.current) return;
    if (atQuota) {
      Alert.alert('Límite de plan', `Ya tienes ${shopPlan!.used}/${shopPlan!.limit} anuncios activos.`, [
        { text: 'OK', style: 'cancel' },
        { text: 'Mejorar plan', onPress: () => router.push('/ecomerse-planes' as any) },
      ]);
      return;
    }
    const price = parsePrice(pPrice);
    if (!pTitle.trim() || price == null) {
      Alert.alert('Faltan datos', 'Título y precio (número válido en XAF) son obligatorios.'); return;
    }
    /* LOS TRES ESCALONES. Un anuncio vive en una HOJA (nivel 3), así que se piden departamento y
       familia siempre, y además la hoja cuando la familia tiene alguna. La excepción no es un
       descuido: hay familias con 0 hojas —una rama abierta que todavía no se ha desglosado—, y
       exigir una hoja que no existe dejaría al vendedor sin publicar y sin saber por qué. Se pide
       lo que hay. */
    if (!pCatId) { Alert.alert('Falta el departamento', 'Elige el departamento: es el primer bloque del Mercado.'); return; }
    const dep = cats.find((c) => c.id === pCatId);
    if (!pFamId) { Alert.alert('Falta la familia', `Elige una familia de «${dep?.label ?? 'el departamento'}».`); return; }
    const fam = dep?.familias.find((f) => f.id === pFamId);
    if (fam?.hojas.length && !pSubId) {
      Alert.alert('Falta la hoja', `Mira dentro de «${fam.label}» y elige dónde encaja tu anuncio.`); return;
    }
    if (!pEstado) {
      Alert.alert('Falta el estado', 'Dinos en qué estado está el artículo: es lo primero que mira quien compra de segunda mano.');
      return;
    }
    /* Sección 1: marca y modelo son los campos que Dewu usa como identidad del producto (su
       verificación se apoya en el modelo exacto). Aquí no hay verificación, pero sirven para lo
       mismo que sirven en cualquier marketplace: que el comprador encuentre el artículo buscando
       «iPhone 11» en vez de fiarse del título que cada vendedor escriba. */
    if (!pMarca.trim()) { Alert.alert('Falta la marca', 'Escribe la marca del artículo (por ejemplo: Apple, Nike, Samsung).'); return; }
    if (!pModelo.trim()) { Alert.alert('Falta el modelo', 'Escribe el modelo (por ejemplo: iPhone 11 64 GB). Es lo que usará quien busque.'); return; }
    if (pPhotos.length < MIN_FOTOS) {
      Alert.alert(
        `Faltan fotos (${pPhotos.length}/${MIN_FOTOS})`,
        'En un mercado de segunda mano la foto es lo único que el comprador tiene para juzgar el estado: sube al menos tres (el producto entero, algún detalle y, si hay, la marca o el desperfecto).');
      return;
    }
    /* Sección 4: el vendedor tiene que decir cómo entrega. Sin esto, un anuncio podía caer en un
       reparto que quien vende no ofrece. */
    if (!pEntrega) {
      Alert.alert('Falta la entrega', 'Dinos cómo entregas el producto: tú mismo, con un agente de la plataforma, o las dos.');
      return;
    }
    /* Sección 5: los términos se aceptan de forma expresa. Sin esto no se publica. */
    if (!pAceptaTerminos) {
      Alert.alert('Faltan los términos', 'Marca la casilla de condiciones: incluye lo que cobras, cómo funciona la garantía y qué pasa si hay una reclamación.');
      return;
    }
    busyRef.current = true;
    setBusyPub(true);
    try {
      const body = {
        title: pTitle.trim(), priceXaf: price, city: pCity.trim() || city,
        description: pDesc.trim() || undefined,
        /* El árbol con sus tres nombres. Se mandan los TRES aunque la hoja sea la única que el
           anuncio necesita: el servidor comprueba que la hoja pertenece a esa familia y que la
           familia pertenece a ese departamento, y con solo la hoja no tendría con qué compararla. */
        departmentId: pCatId, familyId: pFamId, leafId: pSubId || undefined,
        photos: pPhotos, stock: Math.max(1, Math.min(Number(pStock) || 1, 1000)),
        isNegotiable: pNegociable,
        /** Sección 4 · logística: plazo y devoluciones (columnas propias desde la migración 019). */
        handlingHours: pPlazo,
        returnsAccepted: pDevoluciones,
        /** Sección 3 · documentación: los ya guardados más el que se acaba de adjuntar, si lo hay. */
        docs: docsParaEnviar,
        /**
         * Todo lo que la ficha necesita para ser útil viaja aquí, en `attributes` (jsonb, ya existe
         * y admite string/number/boolean: `ecomerse.dto.ts:32`). Se omiten los vacíos para no
         * ensuciar el JSON con cadenas vacías.
         */
        attributes: {
          estado: pEstado,
          marca: pMarca.trim(),
          modelo: pModelo.trim(),
          ...(pSku.trim() ? { sku: pSku.trim() } : {}),
          ...(pTalla.trim() ? { talla: pTalla.trim() } : {}),
          ...(pColor.trim() ? { color: pColor.trim() } : {}),
          entrega: pEntrega,
        },
      };
      const r = editId
        ? await ecomerseApi.updateProduct(editId, body)
        : await ecomerseApi.createProduct(body);
      /**
       * UN ANUNCIO NUEVO NO PUEDE LLEVAR COMBINACIONES EN EL ALTA, y no es un olvido del backend: el
       * servidor **rechaza** `options` en `POST`/`PUT products` para que nadie crea que las publicó
       * (el contenido pasa por moderación y las combinaciones no: son dos carriles). Así que en vez de
       * dejar al comerciante sin saberlo, se le ofrece el paso que falta justo cuando lo necesita —
       * que es ahora, no en un menú que hay que descubrir.
       */
      const nuevoId = 'productId' in r ? r.productId : null;
      if (!editId && nuevoId) {
        Alert.alert('Producto enviado', r.message, [
          { text: 'Añadir combinaciones', onPress: () => router.push(`/tienda/combinaciones?id=${nuevoId}` as never) },
          { text: 'Ahora no', style: 'cancel' },
        ]);
      } else {
        Alert.alert(editId ? 'Corrección enviada' : 'Producto enviado', r.message);
      }
      limpiarFormulario();
      await load();
    } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { busyRef.current = false; setBusyPub(false); }
  };

  const startEdit = (p: EcomerseProduct) => {
    setEditId(p.id);
    setPTitle(p.title);
    setPPrice(String(p.priceXaf));
    setPCity(p.city || city);
    setPDesc(p.description ?? '');
    /* Se prefieren los campos del árbol y se cae a los viejos. Un anuncio publicado antes de este
       cambio solo trae `categoryId` / `subcategoryId`, y el servidor los sigue rellenando con la
       familia y la hoja, así que el formulario abre con lo que el anuncio tenía en vez de en blanco. */
    setPCatId(p.departmentId ?? '');
    setPFamId(p.familyId ?? p.categoryId ?? '');
    setPSubId(p.leafId ?? p.subcategoryId ?? '');
    setPPhotos(p.photos ?? []);
    setPStock(String(p.stock || 1));
    // El estado viene de `attributes.estado`. Si el anuncio es antiguo y no lo tiene, se deja
    // VACÍO a propósito: así al reenviar hay que elegirlo, en vez de inventarle uno.
    const guardado = p.attributes?.estado;
    setPEstado(ESTADOS.includes(guardado as EstadoArticulo) ? (guardado as EstadoArticulo) : '');
    /* Campos nuevos: se leen de `attributes` y de `isNegotiable`. Si el anuncio es antiguo y no los
       tiene, quedan vacíos y la validación obligará a completarlos al reenviar (no se inventan). */
    const at = (p.attributes ?? {}) as Record<string, unknown>;
    const txt = (k: string) => (typeof at[k] === 'string' ? (at[k] as string) : '');
    setPMarca(txt('marca')); setPModelo(txt('modelo')); setPSku(txt('sku'));
    setPTalla(txt('talla')); setPColor(txt('color'));
    setPNegociable(p.isNegotiable !== false);
    const ent = txt('entrega');
    setPEntrega(ENTREGAS.some((e) => e.id === ent) ? (ent as FormaEntrega) : '');
    /* Tanda 4: plazo, devoluciones y documentación ya guardada del anuncio. */
    setPPlazo(PLAZOS.some((z) => z.horas === p.handlingHours) ? p.handlingHours : 24);
    setPDevoluciones(p.returnsAccepted === true);
    setPDocs(
      (p.docs ?? [])
        .filter((d) => DOCS.some((x) => x.id === d.docType))
        .map((d) => ({
          docType: d.docType as DocTipo, url: d.url,
          ...(d.docNumber ? { docNumber: d.docNumber } : {}),
          ...(d.amountXaf !== null && d.amountXaf !== undefined ? { amountXaf: d.amountXaf } : {}),
          ...(d.issuedOn ? { issuedOn: d.issuedOn } : {}),
        })),
    );
    setPDocTipo(''); setPDocNumero(''); setPDocImporte(''); setPDocFecha(''); setPDocFoto(null);
    setPAceptaTerminos(false); setPreview(false);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  /**
   * Corrección de un anuncio rechazado: se llega desde «Anuncios» con `?id=`. Va **después** de
   * `startEdit` porque lo usa, y espera a tener los productos cargados: si se rellenara antes,
   * `startEdit` escribiría sobre campos que aún no existen.
   */
  const yaRellenado = useRef(false);
  useEffect(() => {
    if (!idCorregir || !me || yaRellenado.current) return;
    const p = me.products.find((x) => x.id === idCorregir);
    if (!p) return;
    yaRellenado.current = true;
    startEdit(p);
  }, [idCorregir, me]);

  const s = styles(colors);
  const seller = me?.seller;
  const pricePreview = parsePrice(pPrice);

  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}><View style={{ width: 22 }} /><Text style={{ flex: 1, textAlign: 'center', fontSize: tipografia.subtitle, fontWeight: peso.titulo, color: colors.textPrimary }}>Publicar anuncio</Text><View style={{ width: 22 }} /></View>
        <View style={{ padding: espaciado.e16, gap: espaciado.e12 }}>
          {[0, 1, 2].map((i) => <View key={i} style={{ height: 90, borderRadius: radios.md, backgroundColor: colors.border, opacity: 0.6 }} />)}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}><Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver"><ArrowLeft size={22} color={colors.textPrimary} /></Pressable><Text style={{ flex: 1, textAlign: 'center', fontSize: tipografia.subtitle, fontWeight: peso.titulo, color: colors.textPrimary }}>Publicar anuncio</Text><View style={{ width: 22 }} /></View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e32 }}>
          <Text style={{ fontSize: ilustracion.md, marginBottom: espaciado.e8 }}>📡</Text>
          <Text style={{ fontSize: tipografia.body, fontWeight: peso.titulo, color: colors.textPrimary }}>No pudimos cargar tu tienda</Text>
          <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 }}>{error}</Text>
          <Pressable onPress={load} style={{ marginTop: espaciado.e18, backgroundColor: colors.primary, paddingHorizontal: espaciado.e20, paddingVertical: espaciado.e11, borderRadius: radios.full }}>
            <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.body }}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver"><ArrowLeft size={22} color={colors.textPrimary} /></Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: tipografia.subtitle, fontWeight: peso.titulo, color: colors.textPrimary }}>
          {editId ? 'Corregir anuncio' : 'Publicar anuncio'}
        </Text>
        {/*
          El enlace «Ventas» que había aquí se ha ido: ahora es una PESTAÑA de la barra de la zona.
          Dos caminos al mismo sitio, uno de ellos un texto de 12 px en una cabecera, es la clase de
          duplicado que ya limpiamos del Mercado.
        */}
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        /*
          Antes era una LISTA VIRTUALIZADA porque el último tramo de la pantalla eran «Mis
          productos», con un .map() que montaba todos. Con los productos fuera (viven en la pestaña
          «Anuncios»), lo que queda es un formulario largo y nada más: un ScrollView es lo honesto.
        */
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: espaciado.e16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/*
            DATOS DEL NEGOCIO Y KYC: se han ido a la pestaña «Tienda». Aquí solo se publica: el
            formulario del negocio, la solicitud de alta y el aviso de rechazo de la TIENDA no
            pintan nada en medio de los campos de un anuncio, y estaban justo ahí —el vendedor
            bajaba por su formulario y se encontraba con el formulario de su empresa.
          */}

          {/*
            PUERTA DE ENTRADA. Solo se publica con la tienda APROBADA (`status === 'active'`): un
            anuncio de una tienda sin aprobar no sale al catálogo, así que dejar el formulario a la
            vista sería invitar a rellenar seis secciones para nada. Cuando no se puede publicar se
            dice por qué y se lleva al sitio donde se arregla (pestaña «Tienda»), en vez de dejar la
            pantalla en blanco.
          */}
          {seller?.status !== 'active' && (
            <View style={{ backgroundColor: alpha(colors.primary, 0.06), borderRadius: radios.md, padding: espaciado.e14 }}>
              <Text style={{ fontSize: ilustracion.md, marginBottom: espaciado.e6 }}>{seller ? '⏳' : '🏪'}</Text>
              <Text style={{ fontSize: tipografia.body, fontWeight: peso.titulo, color: colors.textPrimary }}>
                {seller ? `Tu tienda está ${(STATUS_LABEL[seller.status] ?? seller.status).toLowerCase()}` : 'Todavía no tienes tienda'}
              </Text>
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e4, lineHeight: 18 }}>
                {seller
                  ? (seller.rejectionReason
                    ? `Motivo: ${seller.rejectionReason}`
                    : 'Cuando el administrador la apruebe podrás publicar anuncios. Suele tardar 24–48 h.')
                  : 'Da de alta tu negocio para empezar a publicar: identidad verificada (KYC), nombre y ciudad.'}
              </Text>
              {!seller && (
                <View style={{ marginTop: espaciado.e12 }}>
                  <PrimaryButton title="Abrir los datos de mi tienda" onPress={() => router.replace('/tienda/perfil' as never)} />
                </View>
              )}
            </View>
          )}

          {/* Publicar / corregir (solo activo) */}
          {seller?.status === 'active' && (
            <>
              <Text style={s.sectionTitle}>
                {editId ? 'Corregir producto (reenvía a revisión)' : 'Publicar producto'}
              </Text>
              {/* Las seis secciones del formulario, las mismas que pide la app de referencia (得物):
                  producto · fotos · documentación · entrega · condiciones. Los datos del
                  vendedor ya no son una sección del formulario: están en la pestaña «Tienda» y se
                  rellenan una vez, no en cada anuncio. La línea de índice le dice al vendedor
                  cuánto queda. */}
              <Text style={{ fontSize: tipografia.micro, fontWeight: peso.titulo, color: colors.textSecondary, marginBottom: espaciado.e10 }}>
                1 · Producto · 2 · Fotos · 3 · Documentación · 4 · Entrega · 5 · Condiciones
              </Text>
              <Text style={[s.sectionTitle, { marginTop: espaciado.e4 }]}>1 · Producto</Text>
              {editId && (
                <GhostButton title="Cancelar edición" onPress={() => { setEditId(null); setPTitle(''); setPPrice(''); setPDesc(''); setPCatId(''); setPFamId(''); setPSubId(''); setPPhotos([]); setPStock('1'); setPEstado(''); }} />
              )}
              {atQuota && (
                <View style={{ backgroundColor: alpha(brand.secondary, 0.12), borderRadius: radios.md, padding: espaciado.e10, marginBottom: espaciado.e10 }}>
                  <Text style={{ fontSize: tipografia.caption, color: colors.text.secondary, fontWeight: peso.titulo }}>
                    Llegaste al límite de tu plan ({shopPlan?.used}/{shopPlan?.limit}).{' '}
                    <Text onPress={() => router.push('/ecomerse-planes' as any)} style={{ textDecorationLine: 'underline' }}>Mejorar plan ›</Text>
                  </Text>
                </View>
              )}
              <FormField value={pTitle} onChangeText={setPTitle} placeholder="Título * (ej: iPhone 11 64GB)" />
              <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e10 }}>
                <View style={{ flex: 1 }}><FormField value={pMarca} onChangeText={setPMarca} placeholder="Marca * (ej: Apple)" /></View>
                <View style={{ flex: 1 }}><FormField value={pModelo} onChangeText={setPModelo} placeholder="Modelo * (ej: iPhone 11)" /></View>
              </View>
              {/* SECCIÓN 1 · c · SKU o código de producto: lo usa quien repone stock y quien factura. */}
              <View style={{ marginTop: espaciado.e10 }}>
                <FormField value={pSku} onChangeText={setPSku} placeholder="SKU o código (opcional)" />
              </View>
              <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e10 }}>
                <View style={{ flex: 1 }}><FormField value={pPrice} onChangeText={setPPrice} placeholder="Precio XAF * (ej: 12.500)" keyboardType="numeric" /></View>
                <View style={{ flex: 1 }}><FormField value={pStock} onChangeText={setPStock} placeholder="Stock" keyboardType="numeric" /></View>
              </View>
              {pricePreview != null && (
                <Text style={{ fontSize: tipografia.micro, color: colors.text.secondary, fontWeight: peso.fuerte, marginTop: espaciado.e4 }}>≈ {formatXAF(pricePreview)}</Text>
              )}
              <Pressable onPress={() => setCityModal('prod')} accessibilityRole="button" accessibilityLabel="Elegir ciudad del producto"
                style={[s.cityPicker, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: espaciado.e10 }]}>
                <Text style={{ fontSize: tipografia.body, fontWeight: peso.medio, color: pCity ? colors.textPrimary : colors.textSecondary }}>
                  {pCity ? `📍 ${pCity}` : `Ciudad (${city || 'Malabo'})`}
                </Text>
                <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>▾</Text>
              </Pressable>
              {/* DEPARTAMENTO · FAMILIA · HOJA. Tres escalones y no dos: el anuncio vive en la hoja,
                  pero para llegar a ella hay que pasar por la familia. Cada escalón aparece solo
                  cuando el de arriba está elegido, y al cambiar uno se VACÍAN los de abajo — si no,
                  quedaría una hoja de una rama colgando de otra familia, y al guardar el servidor la
                  rechazaría con razón (`assertHoja` comprueba la cadena entera).
                  El tercer escalón solo sale si la familia tiene hojas: hay ramas sin desglosar, y
                  un selector vacío que bloquea la publicación es peor que no pedirlo. */}
              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary, marginTop: espaciado.e14, marginBottom: espaciado.e6 }}>Departamento *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8 }}>
                {cats.map((c) => (
                  <Pressable key={c.id} onPress={() => { setPCatId(pCatId === c.id ? '' : c.id); setPFamId(''); setPSubId(''); }} accessibilityRole="button" accessibilityLabel={c.label}
                    style={{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg, backgroundColor: pCatId === c.id ? colors.primary : colors.surface, borderWidth: trazo.fino, borderColor: pCatId === c.id ? colors.primary : colors.border, flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 }}>
                    <Text style={{ fontSize: tipografia.body }}>{c.icon ?? ''}</Text>
                    <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: pCatId === c.id ? brand.white : colors.textPrimary }}>{c.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {/* FAMILIA (obligatoria si el departamento tiene alguna). */}
              {pCatId && (() => {
                const dep = cats.find((c) => c.id === pCatId);
                if (!dep || !dep.familias?.length) return null;
                return (
                  <>
                    <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary, marginTop: espaciado.e10, marginBottom: espaciado.e6 }}>Familia *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8 }}>
                      {dep.familias.map((f) => (
                        <Pressable key={f.id} onPress={() => { setPFamId(pFamId === f.id ? '' : f.id); setPSubId(''); }} accessibilityRole="button" accessibilityLabel={f.label}
                          style={{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg, backgroundColor: pFamId === f.id ? colors.primary : colors.surface, borderWidth: trazo.fino, borderColor: pFamId === f.id ? colors.primary : colors.border }}>
                          <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: pFamId === f.id ? brand.white : colors.textPrimary }}>{f.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                );
              })()}
              {/* HOJA (obligatoria si la familia tiene). Es el nivel donde el anuncio queda colgado. */}
              {pFamId && (() => {
                const fam = cats.find((c) => c.id === pCatId)?.familias?.find((f) => f.id === pFamId);
                if (!fam || !fam.hojas?.length) return null;
                return (
                  <>
                    <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary, marginTop: espaciado.e10, marginBottom: espaciado.e6 }}>Dónde encaja *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8 }}>
                      {fam.hojas.map((l) => (
                        <Pressable key={l.id} onPress={() => setPSubId(pSubId === l.id ? '' : l.id)} accessibilityRole="button" accessibilityLabel={l.label}
                          style={{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg, backgroundColor: pSubId === l.id ? colors.primary : colors.surface, borderWidth: trazo.fino, borderColor: pSubId === l.id ? colors.primary : colors.border }}>
                          <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: pSubId === l.id ? brand.white : colors.textPrimary }}>{l.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                );
              })()}
              <View style={{ marginTop: espaciado.e10 }} />
              {/* ESTADO DEL ARTÍCULO (tanda 2 de la comparación con 得物/Dewu).
                  Antes no era un campo: el vendedor lo escribía, si quería, dentro de la descripción
                  («Descripción (estado, características…)»), así que el comprador no podía filtrar ni
                  comparar por estado y la ficha nunca lo mostraba. `attributes.estado` ya existía en
                  el esquema y `ecomerse.tsx:504` ya sabía pintarlo: faltaba recogerlo. En un mercado
                  de segunda mano «¿en qué estado está?» es la primera pregunta, así que es obligatorio. */}
              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary, marginTop: espaciado.e12, marginBottom: espaciado.e6 }}>
                Estado del artículo *
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
                {ESTADOS.map((e) => {
                  const on = pEstado === e;
                  return (
                    <Pressable
                      key={e}
                      onPress={() => setPEstado(e)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`Estado: ${e}`}
                      style={{
                        paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg,
                        backgroundColor: on ? colors.primary : colors.surface,
                        borderWidth: trazo.fino, borderColor: on ? colors.primary : colors.border,
                      }}
                    >
                      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: on ? brand.white : colors.textPrimary }}>{e}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput multiline style={s.area} placeholder="Descripción (características, detalles de uso…)" placeholderTextColor={colors.textSecondary} value={pDesc} onChangeText={setPDesc} />
              {/* Fotos: la primera es la portada. El mínimo son 3 y no 1 (tanda 2): en un mercado de
                  segunda mano la foto es la única forma que tiene el comprador de juzgar el estado, y
                  con una sola no puede. El tope sigue siendo 6. */}
              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary, marginTop: espaciado.e18, marginBottom: espaciado.e6 }}>
                Fotos * (mínimo {MIN_FOTOS}, hasta 6 · la primera es la portada)
              </Text>
              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginBottom: espaciado.e6 }}>
                Para la portada, fondo claro y el producto entero. Después, un detalle y la etiqueta o el desperfecto si lo hay.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
                {pPhotos.map((ph, i) => (
                  <View key={i} style={{ position: 'relative' }}>
                    <Image source={{ uri: ph }} style={{ width: 68, height: 68, borderRadius: radios.md, backgroundColor: colors.surface }} contentFit="cover" />
                    {i === 0 && <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', borderBottomLeftRadius: radios.md, borderBottomRightRadius: radios.md, alignItems: 'center' }}><Text style={{ color: brand.white, fontSize: tipografia.micro, fontWeight: peso.titulo }}>PORTADA</Text></View>}
                    <Pressable onPress={() => setPPhotos((prev) => prev.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar foto"
                      style={{ position: 'absolute', top: -6, right: -6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: radios.full, padding: espaciado.e3 }}>
                      <X size={12} color={brand.white} />
                    </Pressable>
                  </View>
                ))}
                {pPhotos.length < 6 && (
                  <Pressable onPress={pickSource} disabled={pUploading} accessibilityRole="button" accessibilityLabel="Añadir fotos"
                    style={{ width: 68, height: 68, borderRadius: radios.md, borderWidth: trazo.base, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    {pUploading ? <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>Subiendo…</Text> : <><Camera size={20} color={colors.text.primary} /><Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>Añadir</Text></>}
                  </Pressable>
                )}
              </View>

              {/* TALLA Y COLOR — DATOS DE LA FICHA, no lo que se elige (fase 4, 21-sep-2026).
                  Son dos cosas distintas y hasta la fase 4 solo existía esta:
                    · AQUÍ va lo que el comprador LEE. «Talla / medida: 42», «Color: negro». Se guardan
                      en `attributes` (jsonb) y se pintan en la ficha técnica del anuncio
                      (`ecomerse-detail.tsx` los recoge uno a uno).
                    · En «Combinaciones» va lo que el comprador ELIGE, cada una con su precio y sus
                      unidades. Eso decide qué se puede comprar de verdad.
                  Se quedan porque la ficha los enseña y un anuncio sin combinaciones los necesita
                  igual. Y se avisa de dónde está lo otro para que nadie escriba «Talla: 42» creyendo
                  que con eso ya se elige una talla al comprar — que es exactamente lo que pasaba. */}
              <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e12 }}>
                <View style={{ flex: 1 }}><FormField value={pTalla} onChangeText={setPTalla} placeholder="Talla / medida (dato de la ficha)" /></View>
                <View style={{ flex: 1 }}><FormField value={pColor} onChangeText={setPColor} placeholder="Color (dato de la ficha)" /></View>
              </View>

              {/* LA PUERTA A LAS COMBINACIONES. Sólo cuando el anuncio ya EXISTE: uno nuevo no tiene
                  id hasta que se envía, y el servidor no admite `options` en el alta (rechaza los ejes
                  en `POST`/`PUT products` a propósito: el contenido se modera, las combinaciones no).
                  Por eso, al publicar un anuncio nuevo, se ofrece este paso al terminar. */}
              {editId && (
                <Pressable
                  onPress={() => router.push(`/tienda/combinaciones?id=${editId}` as never)}
                  accessibilityRole="button"
                  accessibilityLabel="Editar las combinaciones del anuncio"
                  style={[s.methodCard, { borderColor: colors.border, backgroundColor: colors.surface, marginTop: espaciado.e12 }]}
                >
                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.text.primary }}>
                    Combinaciones (tallas, colores…)
                  </Text>
                  <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2, lineHeight: 16 }}>
                    Si el comprador tiene que ELEGIR algo, se declara ahí: cada combinación con su precio y sus
                    unidades. Se guarda al momento y no vuelve a revisión.
                  </Text>
                </Pressable>
              )}

              {/* ACEPTAR OFERTAS. El backend ya lo traía con `default true` y sin control: el anuncio
                  salía con la etiqueta «💰 Negociable» sin que el vendedor lo hubiera elegido. */}
              <Pressable
                onPress={() => setPNegociable((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: pNegociable }}
                accessibilityLabel="Aceptar ofertas por debajo del precio"
                style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, marginTop: espaciado.e12, paddingVertical: espaciado.e4 }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: radios.sm, borderWidth: trazo.base,
                  borderColor: pNegociable ? colors.primary : colors.border,
                  backgroundColor: pNegociable ? colors.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {pNegociable ? <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary }}>Acepto ofertas</Text>
                  <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: 1 }}>
                    El comprador podrá proponerte un precio menor. Si lo quitas, el anuncio sale con precio firme.
                  </Text>
                </View>
              </Pressable>

              {/* VISTA PREVIA: cómo se verá en el feed y en la ficha. Es lo que evita publicar un
                  anuncio que no se entiende; y es lo que permite ver el efecto del título y la
                  portada ANTES de gastar una revisión del admin. */}
              <Pressable
                onPress={() => setPreview((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: preview }}
                accessibilityLabel={preview ? 'Ocultar la vista previa' : 'Ver cómo quedará el anuncio'}
                style={{ marginTop: espaciado.e14, paddingVertical: espaciado.e8 }}
              >
                <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.text.primary }}>
                  {preview ? '▾ Ocultar la vista previa' : '▸ Ver cómo quedará el anuncio'}
                </Text>
              </Pressable>
              {preview && (
                <View style={[s.previewCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  {pPhotos[0] ? (
                    <Image source={{ uri: pPhotos[0] }} style={{ width: '100%', height: 140 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: '100%', height: 140, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.08) }}>
                      <Text style={{ fontSize: tipografia.title }}>📦</Text>
                    </View>
                  )}
                  <View style={{ padding: espaciado.e10 }}>
                    <Text numberOfLines={2} style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>
                      {pTitle.trim() || 'Título del anuncio'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e4 }}>
                      {/* Figura: la vista previa enseña el precio como lo enseñará la tarjeta, así
                          que usa la primitiva y **su** tamaño de tarjeta (`md`), no un 16 suelto. El
                          estado vacío conserva su unidad («— XAF») porque en un precio que falta la
                          unidad sigue diciendo de qué moneda se habla. */}
                      <Precio valor={pricePreview} textoVacio="— XAF" />
                      {pEstado ? <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>{pEstado}</Text> : null}
                    </View>
                    <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e4 }}>
                      {[pMarca.trim(), pModelo.trim()].filter(Boolean).join(' ') || 'Marca y modelo'}
                      {pTalla.trim() ? ` · ${pTalla.trim()}` : ''}{pColor.trim() ? ` · ${pColor.trim()}` : ''}
                    </Text>
                    <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>
                      {pCity.trim() || city || 'Malabo'} · {seller?.businessName ?? 'Tu tienda'}
                      {pNegociable ? ' · 💰 Negociable' : ''}
                    </Text>
                  </View>
                </View>
              )}

              {/* ============================ SECCIÓN 3 · DOCUMENTACIÓN ========================
                  Tanda 4. Ya existe dónde guardarla (`wallet.ecomerse_product_docs`, migración 019) y
                  su estado: entra como `pending` y la revisa un admin, igual que los documentos del
                  conductor. El comprador la verá CON SU ESTADO — no como un sello de «verificado» que
                  nadie ha comprobado, que es justo la crítica que la prensa china hace a Dewu. */}
              <Text style={[s.sectionTitle, { marginTop: espaciado.e22 }]}>3 · Documentación (opcional)</Text>
              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginBottom: espaciado.e8 }}>
                Sube la factura o el certificado del artículo: da confianza y el comprador la verá. Un admin la revisa antes
                de marcarla como válida, así que aparecerá como «en revisión» hasta entonces.
              </Text>
              {pDocs.length > 0 && (
                <View style={{ gap: espaciado.e6, marginBottom: espaciado.e8 }}>
                  {pDocs.map((d) => (
                    <View key={d.docType} style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                      <Text style={{ flex: 1, fontSize: tipografia.caption, color: colors.textPrimary }}>
                        ✓ {DOCS.find((x) => x.id === d.docType)?.label ?? d.docType}
                        {d.docNumber ? ` · ${d.docNumber}` : ''}
                      </Text>
                      <Pressable onPress={() => setPDocs((prev) => prev.filter((x) => x.docType !== d.docType))}
                        hitSlop={10} accessibilityRole="button" accessibilityLabel={`Quitar ${DOCS.find((x) => x.id === d.docType)?.label ?? d.docType}`}>
                        <Text style={{ fontSize: tipografia.caption, color: colors.text.danger, fontWeight: peso.titulo }}>Quitar</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
                {DOCS.map((d) => {
                  const on = pDocTipo === d.id;
                  return (
                    <Pressable key={d.id} onPress={() => setPDocTipo(on ? '' : d.id)}
                      accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Documento: ${d.label}`}
                      style={{
                        paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg,
                        backgroundColor: on ? colors.primary : colors.surface,
                        borderWidth: trazo.fino, borderColor: on ? colors.primary : colors.border,
                      }}>
                      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: on ? brand.white : colors.textPrimary }}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {pDocTipo ? (
                <View style={{ marginTop: espaciado.e10, gap: espaciado.e8 }}>
                  {/* La factura es la única que se puede COMPROBAR contra el anuncio: por eso es la
                      única que pide número, importe y fecha. Un papel sin datos no verifica nada. */}
                  {DOCS.find((d) => d.id === pDocTipo)?.pideDatos && (
                    <>
                      <FormField value={pDocNumero} onChangeText={setPDocNumero} placeholder="Nº de factura (opcional)" />
                      <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
                        <View style={{ flex: 1 }}><FormField value={pDocImporte} onChangeText={setPDocImporte} placeholder="Importe XAF" keyboardType="numeric" /></View>
                        <View style={{ flex: 1 }}><FormField value={pDocFecha} onChangeText={setPDocFecha} placeholder="Fecha (AAAA-MM-DD)" /></View>
                      </View>
                    </>
                  )}
                  {pDocFoto ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}>
                      <Image source={{ uri: pDocFoto }} style={{ width: 56, height: 56, borderRadius: radios.sm, backgroundColor: colors.surface }} contentFit="cover" />
                      <Text style={{ flex: 1, fontSize: tipografia.caption, color: colors.text.success, fontWeight: peso.fuerte }}>Documento listo para enviar</Text>
                      <Pressable onPress={() => setPDocFoto(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Quitar el documento adjunto">
                        <Text style={{ fontSize: tipografia.caption, color: colors.text.danger, fontWeight: peso.titulo }}>Quitar</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
                      <Pressable onPress={() => adjuntarDoc('camera')} disabled={pUploading} accessibilityRole="button" accessibilityLabel="Hacer foto del documento"
                        style={[s.methodCard, { flex: 1, borderColor: colors.border, alignItems: 'center', paddingVertical: espaciado.e12 }]}>
                        <Camera size={18} color={colors.text.primary} />
                        <Text style={{ fontSize: tipografia.micro, color: colors.textPrimary, fontWeight: peso.fuerte, marginTop: espaciado.e2 }}>Hacer foto</Text>
                      </Pressable>
                      <Pressable onPress={() => adjuntarDoc('library')} disabled={pUploading} accessibilityRole="button" accessibilityLabel="Elegir documento de la galería"
                        style={[s.methodCard, { flex: 1, borderColor: colors.border, alignItems: 'center', paddingVertical: espaciado.e12 }]}>
                        <Text style={{ fontSize: tipografia.body }}>🖼</Text>
                        <Text style={{ fontSize: tipografia.micro, color: colors.textPrimary, fontWeight: peso.fuerte, marginTop: espaciado.e2 }}>
                          {pUploading ? 'Subiendo…' : 'De la galería'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : null}

              {/* ============================ SECCIÓN 4 · CONFIGURACIÓN LOGÍSTICA ============== */}
              <Text style={[s.sectionTitle, { marginTop: espaciado.e22 }]}>4 · Entrega</Text>
              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary, marginTop: espaciado.e8, marginBottom: espaciado.e6 }}>
                ¿Cómo entregas? *
              </Text>
              <View style={{ gap: espaciado.e8 }}>
                {ENTREGAS.map((e) => {
                  const on = pEntrega === e.id;
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => setPEntrega(e.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`Entrega: ${e.label}. ${e.hint}`}
                      style={[s.methodCard, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? alpha(colors.primary, 0.06) : colors.surface }]}
                    >
                      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: on ? colors.text.primary : colors.textPrimary }}>{e.label}</Text>
                      <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>{e.hint}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {/* PLAZO DE PREPARACIÓN (tanda 4). Columna `handling_hours` con CHECK (24/48/72). El
                  comprador necesita saber CUÁNDO esperar; sin esto, «entrego yo» no decía nada. */}
              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary, marginTop: espaciado.e14, marginBottom: espaciado.e6 }}>
                ¿Cuánto tardas en entregar? *
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
                {PLAZOS.map((p) => {
                  const on = pPlazo === p.horas;
                  return (
                    <Pressable key={p.horas} onPress={() => setPPlazo(p.horas)}
                      accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Plazo: ${p.label}`}
                      style={{
                        paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg,
                        backgroundColor: on ? colors.primary : colors.surface,
                        borderWidth: trazo.fino, borderColor: on ? colors.primary : colors.border,
                      }}>
                      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: on ? brand.white : colors.textPrimary }}>{p.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* DEVOLUCIONES (tanda 4). Columna `returns_accepted`. Se dice explícitamente que NO es
                  la garantía de la plataforma: son dos cosas distintas y confundirlas sería vender
                  una protección que no existe. */}
              <Pressable
                onPress={() => setPDevoluciones((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: pDevoluciones }}
                accessibilityLabel="Acepto devoluciones"
                style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, marginTop: espaciado.e12, paddingVertical: espaciado.e4 }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: radios.sm, borderWidth: trazo.base,
                  borderColor: pDevoluciones ? colors.primary : colors.border,
                  backgroundColor: pDevoluciones ? colors.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {pDevoluciones ? <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary }}>Acepto devoluciones</Text>
                  <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: 1 }}>
                    Es tu compromiso, no la garantía de la plataforma: esa existe siempre que el pago se haga por la app.
                  </Text>
                </View>
              </Pressable>

              {/* ============================ SECCIÓN 5 · TÉRMINOS ============================= */}
              <Text style={[s.sectionTitle, { marginTop: espaciado.e22 }]}>5 · Condiciones</Text>
              <View style={[s.pendiente, { borderColor: colors.border, marginTop: espaciado.e8 }]}>
                <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, lineHeight: 17 }}>
                  <Text style={{ fontWeight: peso.titulo, color: colors.textPrimary }}>Qué cobras: el precio completo.</Text>{' '}
                  El Mercado **no cobra comisión** por venta: el importe que pongas es el que recibe tu monedero. Si la entrega
                  la hace un agente de la plataforma, el comprador paga aparte la tarifa de su zona (300 XAF + 50/km en zona
                  céntrica) y ese dinero es del reparto, no tuyo.{'\n'}
                  <Text style={{ fontWeight: peso.titulo, color: colors.textPrimary }}>Garantía:</Text> en pedidos pagados por la app, el
                  dinero del comprador queda retenido hasta que reciba, y tiene 7 días desde la entrega para reclamar.
                </Text>
              </View>
              <Pressable
                onPress={() => setPAceptaTerminos((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: pAceptaTerminos }}
                accessibilityLabel="Acepto las condiciones de venta, comisión y garantía"
                style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, marginTop: espaciado.e12, paddingVertical: espaciado.e4 }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: radios.sm, borderWidth: trazo.base,
                  borderColor: pAceptaTerminos ? colors.primary : colors.border,
                  backgroundColor: pAceptaTerminos ? colors.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {pAceptaTerminos ? <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>✓</Text> : null}
                </View>
                <Text style={{ flex: 1, fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }}>
                  Acepto las condiciones de venta, de comisión y de garantía *
                </Text>
              </Pressable>

              <View style={{ marginTop: espaciado.e12 }}>
                <PrimaryButton
                  title={busyPub ? 'Enviando…' : (editId ? 'Reenviar corrección' : 'Publicar (pasa a revisión admin)')}
                  onPress={saveProduct}
                  disabled={busyPub || atQuota}
                />
              </View>
            </>
          )}

          {/*
            «NECESITAN CORRECCIÓN» Y «MIS PRODUCTOS»: se han ido a la pestaña «Anuncios», que es
            donde se gestiona lo publicado. Aquí no pueden estar: el anuncio rechazado se corrige
            entrando desde su fila (con `?id=`), no bajando por el formulario de alta.
            El banner del plan se ha ido a «Tienda».
          */}
        </ScrollView>
      </KeyboardAvoidingView>

      {/*
        Selector de ciudad (24 de GQ): era un `<Modal>` a mano con su cabecera y su «X». El `Sheet`
        trae el fondo, el cierre al tocar fuera, el botón de atrás y el título como cabecera.
      */}
      <Sheet
        visible={cityModal !== null}
        position="bottom"
        title="Elige la ciudad"
        onClose={() => setCityModal(null)}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: espaciado.e16 }}>
          {CITIES.map((c) => (
            <Pressable key={c.id} onPress={() => {
              setPCity(c.name);
              setCityModal(null);
            }} accessibilityRole="button"
              style={[s.cityItem, { borderBottomColor: colors.border }]}>
              <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>{c.name}</Text>
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>{c.region}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: trazo.fino, borderBottomColor: c.border },
  sectionTitle: { fontSize: tipografia.body, fontWeight: peso.titulo, color: c.textPrimary, marginBottom: espaciado.e10 },
  /** Vista previa de la tarjeta tal y como saldrá en el feed. */
  previewCard: { borderRadius: radios.md, borderWidth: trazo.fino, overflow: 'hidden', marginBottom: espaciado.e4 },
  /** Cada forma de entrega: una tarjeta pulsable con título y explicación. */
  methodCard: { borderRadius: radios.md, borderWidth: trazo.base, padding: espaciado.e10 },
  /** Bloque de lo que aún no se puede guardar o de las condiciones: informa, no se rellena. */
  pendiente: { borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e10, backgroundColor: c.surface },
  area: { minHeight: 70, borderRadius: radios.md, borderWidth: trazo.fino, borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary, padding: espaciado.e10, fontSize: tipografia.body, textAlignVertical: 'top' },
  cityPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radios.md, borderWidth: trazo.fino, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e12 },
  cityItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e20, paddingVertical: espaciado.e13, borderBottomWidth: trazo.fino },
});
