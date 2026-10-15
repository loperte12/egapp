/**
 * entornoAtributos · lo que el árbol puede preguntar del APARATO
 * =============================================================
 *
 * ## Por qué existe
 *
 * Las plantillas de Taobao **no son estáticas**: preguntan cosas del aparato. Medido sobre los
 * 246 `.dx` reales del APK (`mercado-fase1/t1c-vocabulario/out/analisis.txt`):
 *
 * | cadena del corpus | en cuántas plantillas |
 * |---|---|
 * | `windowWidth` | 20 |
 * | `isPhoneMode` | 20 |
 * | `isVertical` | 9 |
 * | `isFoldDevice` | 2 |
 *
 * **Los nombres son los de Taobao, copiados del corpus.** No son inventados: si un día se
 * encuentran más, se añaden aquí y se ve en el diff.
 *
 * Y hay una tercera pregunta, que no es una variable sino una RAMA: **la plataforma**. El relevo
 * decía «`android` e `iOS`»; el corpus dice **tres**, con la caja escrita a capricho:
 *
 * ```
 * android ×148   ios ×26   harmony ×15   iOS ×5   Harmony ×4
 * ```
 *
 * ## Cómo se usa
 *
 * El cliente resuelve el entorno del aparato **una vez** y lo pasa al renderizador:
 *
 * ```tsx
 * <Renderizador arbol={a} datos={d} entorno={entornoDelAparato({ ... })} />
 * ```
 *
 * Dentro del árbol, esos valores se leen como cualquier binding, con la raíz `$entorno`:
 *
 * ```jsonc
 * { "tipo": "Texto", "valor": "$entorno.windowWidth" }
 * ```
 *
 * ## Qué está MEDIDO y qué está INFERIDO
 *
 * - **Medido**: que Taobao usa estas cuatro cadenas, y las tres plataformas.
 * - **Inferido (declarado)**: la semántica exacta de cada una. `isVertical` se resuelve como
 *   «el alto es mayor o igual que el ancho» y `isFoldDevice` como «es plegable»; **el APK no se ha
 *   consultado** para confirmarlo. `isPhoneMode` sale `true` porque esta app es de teléfono.
 *   Si alguna no cuadra al pintar, **el sitio donde se corrige es este fichero**.
 */

/** Las cuatro cadenas que el corpus usa, con el nombre EXACTO de Taobao. */
export const NOMBRES_ENTORNO = Object.freeze({
  ANCHO: 'windowWidth',
  PLEGABLE: 'isFoldDevice',
  VERTICAL: 'isVertical',
  TELEFONO: 'isPhoneMode',
  PLATAFORMA: 'plataforma',
  TEMA: 'tema',
});

/**
 * La raíz de los bindings de entorno. **Es una raíz RESERVADA**: `$entorno.*` no se busca en los
 * datos, se busca aquí. Está en una constante para que el renderizador y los tests usen la misma.
 */
export const RAIZ_ENTORNO = 'entorno';

export type Plataforma = 'android' | 'ios' | 'harmony';
export type Tema = 'claro' | 'oscuro';

/** Lo que hay que saber del aparato para resolver el entorno. */
export interface DatosDelAparato {
  ancho: number;
  alto: number;
  /** `Platform.OS` tal cual: `'android'`, `'ios'`, y en HarmonyOS `'harmony'`. */
  plataforma: string;
  /** `useColorScheme()`: `'dark'` pinta oscuro; cualquier otra cosa, claro. */
  esquemaDeColor?: string | null;
  /** Si se sabe. Por defecto, `false`: hoy ningún aparato de la app es plegable. */
  plegable?: boolean;
  /** Si se sabe. Por defecto, `true`: la app es de teléfono. */
  telefono?: boolean;
}

/** El entorno ya resuelto, listo para meterlo bajo `$entorno`. */
export interface Entorno {
  windowWidth: number;
  isFoldDevice: boolean;
  isVertical: boolean;
  isPhoneMode: boolean;
  plataforma: Plataforma;
  tema: Tema;
}

/**
 * Normaliza el sistema al nombre de plataforma del corpus.
 *
 * **HarmonyOS existe**: el corpus tiene 15 plantillas con la rama `harmony`, y React Native para
 * HarmonyOS reporta `'harmony'`. Un sistema que no se reconozca cae en `'android'` — es lo que
 * Taobao hace con las ramas desconocidas (la rama `android` es la que más plantillas tiene).
 */
export function normalizarPlataforma(os: string | null | undefined): Plataforma {
  const s = String(os ?? '').toLowerCase();
  if (s === 'ios' || s === 'iphone' || s === 'ipad') return 'ios';
  if (s.startsWith('harmony') || s === 'ohos' || s === 'hmos') return 'harmony';
  return 'android';
}

/**
 * ¿Este valor de la plantilla es de esta plataforma?
 *
 * **Sin distinguir mayúsculas**: Taobao escribe `iOS` y `ios` en el mismo corpus, así que comparar
 * con `===` fallaría la mitad de las veces.
 */
export function plataformaCoincide(valor: unknown, os: string | null | undefined): boolean {
  if (typeof valor !== 'string') return false;
  return normalizarPlataforma(valor) === normalizarPlataforma(os);
}

/** Del aparato al entorno, sin efectos y sin React: por eso se prueba en un segundo. */
export function entornoDelAparato(d: DatosDelAparato): Entorno {
  return {
    windowWidth: d.ancho,
    isFoldDevice: d.plegable ?? false,
    // **Inferido**: vertical = el alto manda sobre el ancho.
    isVertical: d.alto >= d.ancho,
    isPhoneMode: d.telefono ?? true,
    plataforma: normalizarPlataforma(d.plataforma),
    tema: d.esquemaDeColor === 'dark' ? 'oscuro' : 'claro',
  };
}

export default {
  NOMBRES_ENTORNO, RAIZ_ENTORNO, normalizarPlataforma, plataformaCoincide, entornoDelAparato,
};
