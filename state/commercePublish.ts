/**
 * state/commercePublish.ts — estado del ASISTENTE de publicación (Parte 34 · tanda K).
 *
 * Integra la idea del dueño (zustand + asistente por pasos) con las correcciones
 * detectadas al evaluar su código, para no arrastrar errores:
 *   · fábrica de estado inicial (antes `reset()` compartía el objeto y los arrays)
 *   · fotos por `url` (antes por `position`, que se duplicaba y borraba de más);
 *     la posición la asigna el servidor por el orden del array
 *   · variantes y detalles **sin duplicados** (el servidor rechaza repetidos con 400)
 *   · **clave de idempotencia estable** por intento (antes llevaba `Date.now()` y no
 *     protegía de un doble toque: cada envío parecía nuevo)
 *   · pasos **según el tipo** de publicación y validación por paso
 *
 * TANDA K — «ELEGIR ANTES DE COMPRAR». Lo que se añade aquí es el modelo que faltaba: los EJES de
 * elección (Color con la foto real de cada color, Talla, Almacenamiento, Formato…) y sus
 * COMBINACIONES con precio y stock. Sin ejes, la ficha solo podía enseñar el `name` de la variante
 * («Talla 42») y los botones Comprar/Añadir al carrito compraban directo con la primera. Las
 * combinaciones **no se escriben a mano**: se generan del producto cartesiano de los ejes (como en
 * Taobao o Shopify) y el comerciante solo pone precio y stock, conservando lo que ya había escrito.
 */
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import type {
  LbCondition, LbOptionGroup, LbServiceType, LbSizeChart, LbSizeGender, LbSizeKind, LbSizeRow,
} from '../api/commerce';
/**
 * Los topes, la firma y el cartesiano viven en `utils/combinaciones.ts` (compartidos con el editor
 * del Mercado) y se re-exportan más abajo para que ningún punto de llamada cambie. Ver el porqué,
 * entero, donde estaban escritos.
 */
import { COMBOS_MAX, GRUPOS_MAX, combinacionesDe, firmaDe } from '../utils/combinaciones';

export type PublishStep = 'shop' | 'type' | 'media' | 'details' | 'extras' | 'preview';

export interface PublishMedia { url: string; type: 'image' | 'video' }
export interface PublishVariant {
  name: string;
  priceXaf: string;
  stockQuantity: string;
  /** La combinación: `{ color: 'Rojo', talla: 'M' }`. Es lo que ata la variante a los ejes. */
  attributes: Record<string, string>;
}
export interface PublishAttribute { key: string; value: string }

/** Un valor de un eje. En los ejes de color, `imageUrl` es la foto REAL del producto en ese color. */
export interface PublishOptionValue { value: string; imageUrl: string }
export interface PublishOptionGroup {
  code: string;
  label: string;
  kind: 'color' | 'size' | 'text';
  /** Solo en los ejes de talla: contra qué tabla se recomienda. */
  chartKind?: LbSizeKind | null;
  values: PublishOptionValue[];
}

/** Una talla de la tabla, con los campos tal y como se escriben (texto; el servidor valida). */
export type PublishSizeRow = { sizeLabel: string } & Record<string, string | undefined>;
export interface PublishSizeChartDraft {
  gender: LbSizeGender;
  kind: LbSizeKind;
  notes: string;
  rows: PublishSizeRow[];
}

export interface PublishForm {
  serviceType: LbServiceType;
  categoryId: string | null;
  title: string;
  shortDescription: string;
  longDescription: string;
  priceMode: 'fixed' | 'from' | 'on_request';
  price: string;
  oldPrice: string;
  stockMode: 'exact' | 'approximate' | 'on_request' | 'unlimited';
  stockQuantity: string;
  condition: LbCondition;
  city: string;
  barrio: string;
  tags: string;
  /** Entrega: política de la tienda que se creará/actualizará al publicar. */
  delivers: boolean;
  deliveryCost: string;
  coverage: string[];
  transports: string[];
  media: PublishMedia[];
  variants: PublishVariant[];
  /** Tanda K: los ejes de elección y las tablas de tallas que configura el comerciante. */
  optionGroups: PublishOptionGroup[];
  sizeCharts: PublishSizeChartDraft[];
  attributes: PublishAttribute[];
}

/** Estado inicial SIEMPRE nuevo (evita compartir arrays entre borradores). */
export const createEmptyForm = (serviceType: LbServiceType = 'physical', city = 'Malabo'): PublishForm => ({
  serviceType,
  categoryId: null,
  title: '',
  shortDescription: '',
  longDescription: '',
  priceMode: 'fixed',
  price: '',
  oldPrice: '',
  stockMode: 'exact',
  stockQuantity: '1',
  condition: 'new',
  city,
  barrio: '',
  tags: '',
  delivers: true,
  deliveryCost: '',
  coverage: ['same_city'],
  transports: ['local_courier', 'pickup'],
  media: [],
  variants: [],
  optionGroups: [],
  sizeCharts: [],
  attributes: [],
});

/** Los pasos dependen del tipo: a un oficio no se le piden variantes. */
export function stepsFor(serviceType: LbServiceType, hasShop: boolean): PublishStep[] {
  const base: PublishStep[] = hasShop ? [] : ['shop'];
  base.push('type', 'media', 'details');
  if (serviceType === 'physical' || serviceType === 'food') base.push('extras');
  else base.push('extras'); // extras = detalles + entrega, aplica a todos
  base.push('preview');
  return base;
}

const money = (v: string): number => Number(String(v).replace(/[^\d]/g, '')) || 0;

/**
 * LOS TOPES, LA FIRMA Y EL CARTESIANO SE MUDARON A `utils/combinaciones.ts` (21-sep-2026).
 *
 * Aquí estaban escritos una sola vez, y esa era su virtud: no había dos versiones. El problema
 * apareció con la pantalla de combinaciones del **Mercado**, que necesita exactamente lo mismo —los
 * topes del servidor y el producto cartesiano— y no puede sacarlo de este fichero sin arrastrar el
 * asistente de Life Book entero. Copiarlos allí habría creado la segunda versión, que es justo de
 * donde salen las divergencias silenciosas.
 *
 * Se **importan** (para seguir usándolos aquí dentro) y se **re-exportan** (para que
 * `OptionGroupsEditor` y esta tienda sigan importando de donde importaban, sin tocar ni un punto de
 * llamada). Es el mismo movimiento que hizo el servidor al extraer `services/opciones-producto.ts`.
 */
export { COMBOS_MAX, GRUPOS_MAX, combinacionesDe, firmaDe };

export const formToPayload = (f: PublishForm) => {
  const grupos = f.optionGroups.filter((g) => g.values.length > 0);
  return {
    serviceType: f.serviceType,
    categoryId: f.categoryId,
    title: f.title.trim(),
    shortDescription: f.shortDescription.trim() || null,
    longDescription: f.longDescription.trim() || null,
    priceMode: f.priceMode,
    priceXaf: f.priceMode === 'on_request' ? null : money(f.price),
    // 0 o vacío = sin descuento (el servidor también lo tolera desde la Parte 34)
    oldPriceXaf: money(f.oldPrice) > 0 ? money(f.oldPrice) : null,
    stockMode: f.stockMode,
    stockQuantity: f.stockMode === 'exact' || f.stockMode === 'approximate' ? money(f.stockQuantity) : 0,
    condition: f.condition,
    originCity: f.city,
    originBarrio: f.barrio.trim() || undefined,
    shipsInternational: f.coverage.includes('international'),
    media: f.media.map((m) => ({ url: m.url, type: m.type })),
    tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6),
    /**
     * Tanda K: los ejes con la foto de cada color. Se mandan SIEMPRE (aunque vayan vacíos) para que
     * quitar un eje al editar se guarde de verdad.
     */
    options: f.optionGroups.map((g) => ({
      code: g.code,
      label: g.label,
      kind: g.kind,
      chartKind: g.kind === 'size' ? (g.chartKind ?? null) : null,
      values: g.values.map((v) => ({
        value: v.value,
        // La foto la exige el servidor en los ejes de color; en los demás es opcional.
        imageUrl: v.imageUrl || null,
      })),
    })),
    variants: f.variants
      .filter((v) => v.name.trim())
      .map((v) => ({
        name: v.name.trim(),
        priceXaf: money(v.priceXaf) > 0 ? money(v.priceXaf) : null,
        // Sin dato ≠ 0: el stock vacío se hereda del producto en vez de marcar «agotada»
        stockQuantity: v.stockQuantity.trim() === '' ? money(f.stockQuantity) : money(v.stockQuantity),
        ...(grupos.length ? { attributes: v.attributes } : {}),
      })),
    attributes: f.attributes.filter((a) => a.key.trim() && a.value.trim()),
  };
};

/** Las tablas de tallas tal y como las espera el servidor (los vacíos van como null). */
export const chartsToPayload = (charts: PublishSizeChartDraft[]): LbSizeChart[] => charts
  .filter((c) => c.rows.some((r) => r.sizeLabel?.trim()))
  .map((c) => ({
    gender: c.gender,
    kind: c.kind,
    notes: c.notes.trim() || null,
    rows: c.rows
      .filter((r) => r.sizeLabel?.trim())
      .map((r): LbSizeRow => {
        const n = (v?: string): number | null => {
          const t = String(v ?? '').replace(/[^\d]/g, '');
          return t === '' ? null : Number(t);
        };
        return {
          sizeLabel: r.sizeLabel.trim().slice(0, 20),
          chestMinCm: n(r.chestMinCm), chestMaxCm: n(r.chestMaxCm),
          waistMinCm: n(r.waistMinCm), waistMaxCm: n(r.waistMaxCm),
          hipMinCm: n(r.hipMinCm), hipMaxCm: n(r.hipMaxCm),
          heightMinCm: n(r.heightMinCm), heightMaxCm: n(r.heightMaxCm),
          weightMinKg: n(r.weightMinKg), weightMaxKg: n(r.weightMaxKg),
          footLengthMinCm: n(r.footLengthMinCm), footLengthMaxCm: n(r.footLengthMaxCm),
          footWidthMinCm: n(r.footWidthMinCm), footWidthMaxCm: n(r.footWidthMaxCm),
        };
      }),
  }));

/** Los ejes que llegan del servidor, al borrador de la app. */
export const groupsFromApi = (options: LbOptionGroup[] | undefined): PublishOptionGroup[] =>
  (options ?? []).map((g) => ({
    code: g.code,
    label: g.label,
    kind: g.kind,
    chartKind: g.chartKind ?? null,
    values: (g.values ?? []).map((v) => ({ value: v.value, imageUrl: v.imageUrl ?? '' })),
  }));

/** Las tablas que llegan del servidor, al borrador de la app. */
export const chartsFromApi = (charts: LbSizeChart[] | undefined): PublishSizeChartDraft[] =>
  (charts ?? []).map((c) => ({
    gender: c.gender,
    kind: c.kind,
    notes: c.notes ?? '',
    rows: (c.rows ?? []).map((r) => ({
      sizeLabel: r.sizeLabel,
      chestMinCm: r.chestMinCm != null ? String(r.chestMinCm) : '',
      chestMaxCm: r.chestMaxCm != null ? String(r.chestMaxCm) : '',
      waistMinCm: r.waistMinCm != null ? String(r.waistMinCm) : '',
      waistMaxCm: r.waistMaxCm != null ? String(r.waistMaxCm) : '',
      hipMinCm: r.hipMinCm != null ? String(r.hipMinCm) : '',
      hipMaxCm: r.hipMaxCm != null ? String(r.hipMaxCm) : '',
      heightMinCm: r.heightMinCm != null ? String(r.heightMinCm) : '',
      heightMaxCm: r.heightMaxCm != null ? String(r.heightMaxCm) : '',
      weightMinKg: r.weightMinKg != null ? String(r.weightMinKg) : '',
      weightMaxKg: r.weightMaxKg != null ? String(r.weightMaxKg) : '',
      footLengthMinCm: r.footLengthMinCm != null ? String(r.footLengthMinCm) : '',
      footLengthMaxCm: r.footLengthMaxCm != null ? String(r.footLengthMaxCm) : '',
      footWidthMinCm: r.footWidthMinCm != null ? String(r.footWidthMinCm) : '',
      footWidthMaxCm: r.footWidthMaxCm != null ? String(r.footWidthMaxCm) : '',
    })),
  }));

/** Validación por paso con mensajes claros (lo que el usuario ve). */
export function validateStep(step: PublishStep, f: PublishForm): string | null {
  switch (step) {
    case 'type':
      if (!f.serviceType) return 'Elige qué tipo de publicación quieres crear';
      return null;
    case 'media':
      // La foto solo es obligatoria en las ventas físicas
      if (f.serviceType === 'physical' && f.media.length === 0) return 'Añade al menos una foto de lo que vendes';
      return null;
    case 'details': {
      if (f.title.trim().length < 3) return 'El título necesita al menos 3 letras';
      if (f.priceMode !== 'on_request' && money(f.price) <= 0) return 'Indica el precio o marca «A consultar»';
      if (money(f.oldPrice) > 0 && money(f.oldPrice) <= money(f.price)) return 'El precio anterior debe ser mayor que el actual';
      if (f.stockMode === 'exact' && money(f.stockQuantity) < 1) return 'Indica cuántas unidades tienes (o cambia la disponibilidad)';
      const duplicado = f.variants.some((v, i) => v.name.trim() && f.variants.findIndex((x) => x.name.trim().toLowerCase() === v.name.trim().toLowerCase()) !== i);
      if (duplicado) return 'Hay dos opciones con el mismo nombre';
      const claveRepetida = f.attributes.some((a, i) => a.key.trim() && f.attributes.findIndex((x) => x.key.trim().toLowerCase() === a.key.trim().toLowerCase()) !== i);
      if (claveRepetida) return 'Hay dos detalles con el mismo nombre';
      // Tanda K: los ejes. Es lo que impide publicar un color sin su foto real o una combinación
      // agotada que nadie puede comprar.
      const grupos = f.optionGroups.filter((g) => g.values.length > 0);
      if (f.optionGroups.some((g) => g.values.length === 0)) return 'Hay un eje de opciones sin ningún valor: ponle valores o quítalo';
      if (grupos.length) {
        const sinFoto = grupos.find((g) => g.kind === 'color' && g.values.some((v) => !v.imageUrl));
        if (sinFoto) {
          const cual = sinFoto.values.find((v) => !v.imageUrl)?.value ?? '';
          return `El color «${cual}» necesita su foto real del producto en ese color: no vale solo el nombre`;
        }
        const combos = combinacionesDe(grupos);
        if (combos.length > COMBOS_MAX) return `Con esos valores salen ${combos.length} combinaciones y el máximo es ${COMBOS_MAX}: quita algún color o alguna talla`;
        if (f.variants.length !== combos.length) return 'Pulsa «Generar combinaciones» para poner el precio y el stock de cada combinación';
        if (f.variants.some((v) => !v.attributes || Object.keys(v.attributes).length === 0)) return 'Cada combinación necesita sus valores (pulsa «Generar combinaciones»)';
      }
      return null;
    }
    default:
      return null;
  }
}

interface PublishState {
  form: PublishForm;
  step: PublishStep;
  hasShop: boolean;
  shopName: string | null;
  idemKey: string | null;
  submitting: boolean;
  error: string | null;
  setForm: (patch: Partial<PublishForm>) => void;
  /** Reemplaza el formulario (edición): acepta un parcial y rellena el resto. */
  replaceForm: (patch: Partial<PublishForm>) => void;
  setStep: (step: PublishStep) => void;
  setHasShop: (has: boolean, name?: string | null) => void;
  addMedia: (item: PublishMedia) => void;
  removeMedia: (url: string) => void;
  addVariant: (v: PublishVariant) => string | null;
  removeVariant: (index: number) => void;
  setVariant: (index: number, patch: Partial<PublishVariant>) => void;
  /** Añade un eje (con sus valores sugeridos, sin foto: la foto la elige el comerciante). */
  addOptionGroup: (g: PublishOptionGroup) => string | null;
  removeOptionGroup: (code: string) => void;
  setOptionGroup: (code: string, patch: Partial<Omit<PublishOptionGroup, 'code' | 'values'>>) => void;
  addOptionValue: (code: string, value: string) => string | null;
  removeOptionValue: (code: string, value: string) => void;
  /** La foto REAL de un color: se elige entre las fotos que el comerciante ya subió. */
  setOptionValuePhoto: (code: string, value: string, imageUrl: string) => void;
  /** Genera las combinaciones del producto cartesiano conservando precios y stock ya escritos. */
  generarCombinaciones: () => string | null;
  setSizeChart: (chart: PublishSizeChartDraft) => void;
  removeSizeChart: (gender: LbSizeGender, kind: LbSizeKind) => void;
  setAttribute: (key: string, value: string) => void;
  removeAttribute: (key: string) => void;
  ensureIdemKey: () => string;
  clearIdemKey: () => void;
  setSubmitting: (v: boolean) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const usePublishStore = create<PublishState>((set, get) => ({
  form: createEmptyForm(),
  step: 'type',
  hasShop: false,
  shopName: null,
  idemKey: null,
  submitting: false,
  error: null,

  setForm: (patch) => set((s) => ({ form: { ...s.form, ...patch }, error: null })),
  replaceForm: (patch) => set({ form: { ...createEmptyForm(), ...patch }, error: null }),
  setStep: (step) => set({ step, error: null }),
  setHasShop: (hasShop, shopName = null) => set({ hasShop, shopName }),

  addMedia: (item) => set((s) => (
    s.form.media.some((m) => m.url === item.url)
      ? s
      : { form: { ...s.form, media: [...s.form.media, item].slice(0, 10) }, error: null }
  )),
  removeMedia: (url) => set((s) => ({ form: { ...s.form, media: s.form.media.filter((m) => m.url !== url) } })),

  /** Devuelve el motivo si no se añade (nombre vacío o repetido). */
  addVariant: (v) => {
    const name = v.name.trim();
    if (!name) return 'La opción necesita un nombre';
    const cur = get().form.variants;
    if (cur.some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) return 'Ya tienes una opción con ese nombre';
    if (cur.length >= COMBOS_MAX) return `Como máximo ${COMBOS_MAX} opciones`;
    set((s) => ({ form: { ...s.form, variants: [...s.form.variants, { ...v, name }] }, error: null }));
    return null;
  },
  removeVariant: (index) => set((s) => ({ form: { ...s.form, variants: s.form.variants.filter((_, i) => i !== index) } })),
  setVariant: (index, patch) => set((s) => ({
    form: {
      ...s.form,
      variants: s.form.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    },
  })),

  // ── Tanda K: los ejes de elección ────────────────────────────────────────
  addOptionGroup: (g) => {
    const code = g.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
    if (code.length < 2) return 'El eje necesita un nombre corto (por ejemplo «color» o «talla»)';
    const cur = get().form.optionGroups;
    if (cur.some((x) => x.code === code)) return `Ya tienes el eje «${g.label}»`;
    if (cur.length >= GRUPOS_MAX) return `Como máximo ${GRUPOS_MAX} ejes (por ejemplo Color y Talla)`;
    if (!g.values.length) return 'El eje necesita al menos un valor';
    set((s) => ({
      form: { ...s.form, optionGroups: [...s.form.optionGroups, { ...g, code, values: [...g.values] }] },
      error: null,
    }));
    return null;
  },
  removeOptionGroup: (code) => set((s) => {
    const grupos = s.form.optionGroups.filter((g) => g.code !== code);
    return {
      form: {
        ...s.form,
        optionGroups: grupos,
        /**
         * Las combinaciones que dependían de ese eje ya no valen: se les quita el valor de ese eje
         * (y si no queda ningún eje, se quedan sin combinación, que es lo correcto: vuelven a ser
         * opciones sueltas). Sin esto, el servidor rechazaría la publicación por mandar un eje que
         * ya no existe.
         */
        variants: s.form.variants.map((v) => {
          const attrs = { ...v.attributes };
          delete attrs[code];
          return { ...v, attributes: grupos.length ? attrs : {} };
        }),
      },
    };
  }),
  setOptionGroup: (code, patch) => set((s) => ({
    form: {
      ...s.form,
      optionGroups: s.form.optionGroups.map((g) => (g.code === code ? { ...g, ...patch } : g)),
    },
    error: null,
  })),
  addOptionValue: (code, value) => {
    const v = value.trim().slice(0, 40);
    if (!v) return 'El valor necesita un nombre';
    const grupo = get().form.optionGroups.find((g) => g.code === code);
    if (!grupo) return 'Ese eje no existe';
    if (grupo.values.some((x) => x.value.toLowerCase() === v.toLowerCase())) return `«${v}» ya está en ${grupo.label}`;
    if (grupo.values.length >= 30) return 'Como máximo 30 valores por eje';
    set((s) => ({
      form: {
        ...s.form,
        optionGroups: s.form.optionGroups.map((g) => (
          g.code === code ? { ...g, values: [...g.values, { value: v, imageUrl: '' }] } : g
        )),
      },
      error: null,
    }));
    return null;
  },
  removeOptionValue: (code, value) => set((s) => ({
    form: {
      ...s.form,
      optionGroups: s.form.optionGroups.map((g) => (
        g.code === code ? { ...g, values: g.values.filter((x) => x.value !== value) } : g
      )),
    },
  })),
  setOptionValuePhoto: (code, value, imageUrl) => set((s) => ({
    form: {
      ...s.form,
      optionGroups: s.form.optionGroups.map((g) => (
        g.code === code
          ? { ...g, values: g.values.map((x) => (x.value === value ? { ...x, imageUrl } : x)) }
          : g
      )),
    },
    error: null,
  })),

  /**
   * Genera las combinaciones del producto cartesiano.
   *
   * **Conserva** el precio y el stock de las combinaciones que ya existían (misma firma) para no
   * borrar el trabajo del comerciante cada vez que añade un color o una talla.
   */
  generarCombinaciones: () => {
    const grupos = get().form.optionGroups.filter((g) => g.values.length > 0);
    if (!grupos.length) return 'Primero añade un eje con sus valores (por ejemplo Color o Talla)';
    const combos = combinacionesDe(grupos);
    if (combos.length > COMBOS_MAX) return `Con esos valores salen ${combos.length} combinaciones y el máximo es ${COMBOS_MAX}`;
    const antes = get().form.variants;
    const porFirma = new Map(antes.filter((v) => v.attributes && Object.keys(v.attributes).length).map((v) => [firmaDe(grupos, v.attributes), v]));
    const productStock = get().form.stockQuantity;
    set((s) => ({
      form: {
        ...s.form,
        variants: combos.map((c) => {
          const previo = porFirma.get(firmaDe(grupos, c.attrs));
          return {
            name: c.nombre,
            priceXaf: previo?.priceXaf ?? '',
            stockQuantity: previo?.stockQuantity ?? productStock,
            attributes: c.attrs,
          };
        }),
      },
      error: null,
    }));
    return null;
  },

  // ── Tanda J: las tablas de tallas ────────────────────────────────────────
  setSizeChart: (chart) => set((s) => ({
    form: {
      ...s.form,
      sizeCharts: [
        ...s.form.sizeCharts.filter((c) => !(c.gender === chart.gender && c.kind === chart.kind)),
        chart,
      ],
    },
    error: null,
  })),
  removeSizeChart: (gender, kind) => set((s) => ({
    form: { ...s.form, sizeCharts: s.form.sizeCharts.filter((c) => !(c.gender === gender && c.kind === kind)) },
  })),

  /** Alta o edición de un detalle por clave (evita claves repetidas). */
  setAttribute: (key, value) => {
    const k = key.trim();
    const v = value.trim();
    if (!k) return;
    set((s) => {
      const others = s.form.attributes.filter((a) => a.key.trim().toLowerCase() !== k.toLowerCase());
      const list = v ? [...others, { key: k, value: v }] : others;
      return { form: { ...s.form, attributes: list }, error: null };
    });
  },
  removeAttribute: (key) => set((s) => ({
    form: { ...s.form, attributes: s.form.attributes.filter((a) => a.key !== key) },
  })),

  /** Clave de idempotencia ESTABLE por intento: se crea una vez y se reutiliza. */
  ensureIdemKey: () => {
    const cur = get().idemKey;
    if (cur) return cur;
    const key = Crypto.randomUUID();
    set({ idemKey: key });
    return key;
  },
  clearIdemKey: () => set({ idemKey: null }),
  setSubmitting: (submitting) => set({ submitting }),
  setError: (error) => set({ error }),
  reset: () => set({ form: createEmptyForm(), step: 'type', idemKey: null, submitting: false, error: null }),
}));
