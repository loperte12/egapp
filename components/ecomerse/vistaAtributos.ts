/**
 * Vista · resolución de atributos del widget `DXVIEW` de Taobao
 * =============================================================
 *
 * **Este módulo es PURO a propósito.** No importa React ni React Native.
 *
 * El motivo no es estético: el **oráculo de fidelidad** (`mercado-fase1/o1-oraculo/`)
 * lo importa **directamente** para comparar lo que este componente resuelve contra lo
 * que el motor de Taobao produce sobre la plantilla `.dx` real.
 *
 * Si esta lógica viviera dentro del `.tsx`, el oráculo tendría que reimplementarla — y
 * entonces verificaría **su copia**, no el componente. Separarla es lo que hace que la
 * verificación signifique algo.
 *
 * Los 12 atributos son los de `DXVIEW` en `tabla-claves.json`, extraídos del código de
 * Taobao (`tb.hd5` = `DXBinaryLoader`). Las claves son `long` de 64 bits: **exceden
 * `Number` en JavaScript**, así que van como **hex de 16** — el mismo formato que usa
 * el oráculo.
 */

// ─────────────────────────── las claves de Taobao ───────────────────────────

/**
 * Claves `long` de los 12 atributos de `DXVIEW`, en hex de 16.
 *
 * Fuente: `mercado-fase1/re-d/tabla-claves.json` (755 claves `nombre → long`
 * extraídas del APK). No se escriben a mano: se copian de ahí.
 */
export const CLAVES_DXVIEW = {
  CLOSEPOSTBINDEVENTFIRSTSCREEN: '706513e636a3e2c0',
  DOWNGRADEUNKNOWNLAYOUT: '417f40730f276a3f',
  ISRELAYOUTBOUNDARY: '04de08893484df87',
  NEEDPOSTPREPAREBINDEVENT: 'c4de2026bfddb188',
  ONCREATEVIEW: '029ed525713c2ad8',
  ROTATIONX: '4015d0f207a283d1',
  ROTATIONY: '4015d0f207a285d2',
  ROTATIONZ: '4015d0f207a287d3',
  SCALEX: '00240d37db93aae6',
  SCALEY: '00240d37db93ab27',
  TRANSLATIONX: 'b2cb15735236f713',
  TRANSLATIONY: 'b2cb157352370714',
} as const;

export type NombreAtributo = keyof typeof CLAVES_DXVIEW;

// ─────────────────────────── cómo se clasifica cada uno ─────────────────────

/**
 * Qué hace el componente con cada atributo. **Declarado, no implícito.**
 *
 * - `transform` — se implementa y su valor es comparable por el oráculo
 * - `layout`    — se implementa, pero el valor **no es comparable**: DinamicX mide
 *                 como Android y Yoga mide distinto. El oráculo lo marca AVISO
 * - `evento`    — se expone como callback; no tiene valor que comparar
 * - `motor`     — no aplica en React Native: es del pipeline de Android
 * - `degradacion` — **la bandera del fallback**, que sí se implementa
 */
export type ClaseAtributo = 'transform' | 'layout' | 'evento' | 'motor' | 'degradacion';

export const CLASE: Record<NombreAtributo, ClaseAtributo> = {
  ROTATIONX: 'transform',
  ROTATIONY: 'transform',
  ROTATIONZ: 'transform',
  SCALEX: 'transform',
  SCALEY: 'transform',
  // El desplazamiento es layout: `translateX` en Yoga no mide como Android.
  TRANSLATIONX: 'layout',
  TRANSLATIONY: 'layout',
  ONCREATEVIEW: 'evento',
  // Estas cuatro son del ciclo de vida del motor de Android. No existen aquí.
  CLOSEPOSTBINDEVENTFIRSTSCREEN: 'motor',
  ISRELAYOUTBOUNDARY: 'motor',
  NEEDPOSTPREPAREBINDEVENT: 'motor',
  // Y esta es la que SÍ importa: la degradación ante layout desconocido.
  // Es el mismo mecanismo que ADR-002 pide para C'.
  DOWNGRADEUNKNOWNLAYOUT: 'degradacion',
};

// ─────────────────────────── el valor de entrada ────────────────────────────

/** Atributos `DXVIEW` tal como llegan decodificados: clave hex → valor. */
export type AtributosDxView = Record<string, number | string | boolean | null | undefined>;

/**
 * Una transformación, en **forma neutra**.
 *
 * **No se usa el tipo `transform` de React Native a propósito.** Este módulo es puro, y meter
 * aquí el tipo de `ViewStyle` obligaba a importarlo — con lo que dejaba de ser puro de verdad.
 * El mapeo a `transform` de RN lo hace `Vista.tsx`, que es quien renderiza.
 *
 * Se declara aquí para que el oráculo pueda leer **qué transformaciones resuelve el componente**
 * y con qué valor, sin depender de React Native.
 */
export type Transformacion =
  | { operacion: 'rotateX' | 'rotateY' | 'rotate'; grados: number }
  | { operacion: 'scaleX' | 'scaleY'; factor: number }
  | { operacion: 'translateX' | 'translateY'; puntos: number };

/** Lo que `Vista` resuelve, en forma neutra. */
export interface ResolucionVista {
  /** Transformaciones **en orden de aplicación**, en forma neutra. */
  transformaciones: Transformacion[];
  /** `true` si Taobao pidió degradar ante un layout desconocido. */
  degradarDesconocido: boolean;
  /** Atributos del motor que se ignoran, **declarados** en vez de olvidados. */
  ignoradosDeMotor: NombreAtributo[];
}

// ─────────────────────────── la resolución ──────────────────────────────────

function numero(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Convierte los atributos de Taobao en lo que React Native necesita.
 *
 * **Sobre el orden de las transformaciones.** React Native aplica el array `transform`
 * **en orden**, y el orden cambia el resultado. Taobao no expone su orden en la
 * plantilla: aplica su propia matriz en el lado Android. Se elige aquí el orden
 * convencional de React Native — **rotar, escalar, desplazar** — y **se declara como
 * decisión**, no como equivalencia demostrada. El oráculo compara valores por atributo,
 * así que **no puede verificar el orden**: eso queda como límite conocido.
 */
export function resolverVista(dx: AtributosDxView = {}): ResolucionVista {
  const transformaciones: Transformacion[] = [];
  const ignoradosDeMotor: NombreAtributo[] = [];

  const rotX = numero(dx[CLAVES_DXVIEW.ROTATIONX]);
  const rotY = numero(dx[CLAVES_DXVIEW.ROTATIONY]);
  const rotZ = numero(dx[CLAVES_DXVIEW.ROTATIONZ]);
  const scX = numero(dx[CLAVES_DXVIEW.SCALEX]);
  const scY = numero(dx[CLAVES_DXVIEW.SCALEY]);
  const trX = numero(dx[CLAVES_DXVIEW.TRANSLATIONX]);
  const trY = numero(dx[CLAVES_DXVIEW.TRANSLATIONY]);

  // 1 · rotación (grados; `ROTATIONZ` es el giro en el plano)
  if (rotX !== undefined && rotX !== 0) transformaciones.push({ operacion: 'rotateX', grados: rotX });
  if (rotY !== undefined && rotY !== 0) transformaciones.push({ operacion: 'rotateY', grados: rotY });
  if (rotZ !== undefined && rotZ !== 0) transformaciones.push({ operacion: 'rotate', grados: rotZ });
  // 2 · escala
  if (scX !== undefined && scX !== 1) transformaciones.push({ operacion: 'scaleX', factor: scX });
  if (scY !== undefined && scY !== 1) transformaciones.push({ operacion: 'scaleY', factor: scY });
  // 3 · desplazamiento — es LAYOUT: se implementa, pero no se compara por valor
  if (trX !== undefined && trX !== 0) transformaciones.push({ operacion: 'translateX', puntos: trX });
  if (trY !== undefined && trY !== 0) transformaciones.push({ operacion: 'translateY', puntos: trY });

  for (const nombre of Object.keys(CLASE) as NombreAtributo[]) {
    if (CLASE[nombre] !== 'motor') continue;
    if (dx[CLAVES_DXVIEW[nombre]] !== undefined) ignoradosDeMotor.push(nombre);
  }

  return {
    transformaciones,
    degradarDesconocido: Boolean(dx[CLAVES_DXVIEW.DOWNGRADEUNKNOWNLAYOUT]),
    ignoradosDeMotor,
  };
}

/**
 * Los atributos que este componente **implementa**, por nombre.
 *
 * Se expone para que el oráculo pueda decir qué falta **sin adivinar**.
 */
export function atributosImplementados(): NombreAtributo[] {
  return (Object.keys(CLASE) as NombreAtributo[]).filter((n) => CLASE[n] !== 'motor');
}
