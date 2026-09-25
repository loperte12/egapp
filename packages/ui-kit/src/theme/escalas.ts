/**
 * ESCALAS ÚNICAS — auditoría de diseño, Fase 2.
 *
 * POR QUÉ EXISTEN: la app tenía **37 tamaños de letra** distintos en 2.801 usos (con valores
 * fraccionarios como 12.5 y 11.5, señal de ajuste a ojo pantalla por pantalla), **46 espaciados**
 * —solo el 47 % múltiplos de 4— y **42 radios** distintos. Sin escala, ninguna pantalla se parece
 * a otra y cada ajuste se rehace.
 *
 * Cómo se usa:
 *   <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte }}>…
 *   <View style={{ padding: espaciado.e16, gap: espaciado.e8, borderRadius: radios.md }}>…
 *
 * Los nombres son de intención, no de tamaño: `body` es el cuerpo, no «14».
 */

/** Tamaños de letra. El cuerpo de la app sube a 14 (antes vivía entre 11 y 13 px). */
export const tipografia = {
  /**
   * Textos de apoyo, sellos y avisos. **10,5, no 11** (decisión del 24/09/2026, propuesta A).
   * POR QUÉ: medido sobre 664 literales, `10,5` es el SEGUNDO valor más escrito del proyecto (110
   * veces) y `10` el quinto (44). La escala decía `micro: 11`, que el código apenas usa. Poner 10,5
   * alinea los 154 literales de 10 y 10,5 y mueve los usos del token **−0,5 px**, imperceptible.
   */
  micro: 10.5,
  /**
   * RÓTULO DE CELDA DENSA — el peldaño que existe por un problema de ANCHO, no de jerarquía.
   *
   * Lo pidió la rejilla de categorías del Mercado: el nombre de la familia va debajo de su miniatura,
   * cuatro celdas por fila en 360 dp, así que al rótulo le quedan **80 dp** (medido en un teléfono de
   * 1080 px a 480 dpi = 3 px por dp exactos). El rótulo mediano de ese árbol mide 14 caracteres y
   * muchos son de tres palabras, así que el ancho es la restricción de verdad.
   *
   * A `micro` (11) caben 8 caracteres por línea y **20 de los 110 rótulos** no entran en dos líneas
   * (45 en una rejilla de 5 columnas, que es como empezó esto). A 9 —**10,35 dp reales** con el
   * `font_scale` 1,15 del móvil de referencia— caben 12 por línea y **no se corta ninguno de los 110**.
   * Por debajo de 8 la letra deja de leerse en pantalla densa, así que este es el suelo de la escala.
   *
   * CÓMO SE MIDIÓ, porque el número importa: con **7,9 dp por carácter a `micro`**, que es la
   * calibración sacada del teléfono —«Supermercados» (13 caracteres) NO cabe en 80 dp y «Servicios
   * del» (13, letras más estrechas) SÍ—. Un medidor que use 7,2 dp dirá que ambos caben y que no hay
   * problema: es la diferencia entre medir y suponer. El barrido está en
   * `_c9-medir-letra-rejilla.cjs`, y en la rejilla la letra solo sirve de algo con **tres líneas**
   * (`LINEAS_ROTULO` en `app/ecomerse.tsx`): con dos, cinco rótulos seguirían perdiendo texto.
   */
  rotulo: 9,
  /** Etiquetas y notas al pie. */
  caption: 12,
  /** Cuerpo de texto: el tamaño por defecto de la app. */
  body: 14,
  /**
   * CUERPO DESTACADO — el peldaño que el código pedía a gritos (decisión del 24/09/2026, propuesta A).
   * `15` es **el valor más escrito a mano del proyecto entero: 151 literales**, y no estaba en la
   * escala (que saltaba de 14 a 16). Se declara para que esos 151 sitios tengan casa sin moverse.
   */
  cuerpo: 15,
  /** Subtítulos y cifras destacadas. */
  subtitle: 16,
  /**
   * CABECERA DE SECCIÓN — 83 literales escritos a mano en `17`, y la escala saltaba de 16 a 20.
   * Igual que `cuerpo`: se declara el valor que el producto ya usa.
   */
  subCabecera: 17,
  /** Título de pantalla. */
  title: 20,
  /**
   * Cifras grandes (saldo, precio). **26, no 28** (decisión del 24/09/2026, propuesta A).
   * POR QUÉ: el código escribe 26 (18 veces) y 22 (16) mucho más que 28, y la propuesta generada de
   * escala situaba el peldaño equivalente en ~24-26. Baja 2 px y es el único cambio VISIBLE de la
   * propuesta A — afecta a cifras hero, que aguantan el ajuste.
   */
  display: 26,
} as const;

/**
 * Pesos. Antes solo había 500–900: **no existía el 400**, así que todo estaba en semibold o más y
 * nada destacaba. `normal` es el nuevo texto base; las cifras y los títulos siguen en `fuerte`.
 */
export const peso = {
  normal: '400',
  medio: '500',
  fuerte: '700',
  /**
   * MÁXIMO — 800. El peldaño que faltaba, y es el valor **más escrito a mano del proyecto: 727
   * literales** (auditoría del 23/09/2026). Sin él no se podía migrar: no se migra a una escala donde
   * el valor más frecuente no existe.
   * Con este peldaño, **1.759 de los 1.975 literales de `fontWeight` pasan a token sin mover un píxel**
   * (800→maximo, 900→titulo, 700→fuerte, 500→medio). Los 214 de `600` bajaron a `medio` por decisión
   * del 24/09/2026: el kit añadió `normal 400` justificándose en que «todo estaba en semibold o más y
   * nada destacaba», y bajar el 600 crea por fin la franja ligera (500 · 700 · 800 · 900).
   */
  maximo: '800',
  titulo: '900',
} as const;

/**
 * ESPACIADO — el CONJUNTO DE VALORES EN USO, nombrado y contado.
 *
 * PRIMERA VERSIÓN (24/09/2026, base 2, 11 peldaños) Y SU CORRECCIÓN, porque el error merece quedar
 * escrito: se declaró una base 2 (2/4/6/8/10/12/14/16/20/24/32) y **82,3 % de los literales entraron**.
 * Faltaba ver qué quedaba fuera, y lo que queda fuera de una base 2 son, por definición, **los impares**:
 *
 *   valor   literales   |   valor   literales
 *     3        181      |    9         79
 *     7        168      |   13         57
 *     5        101      |   11         90
 *
 * Sumaban **450 literales** con uso alto y ninguno era capricho: en una rejilla densa de marketplace
 * (celdas de 80 dp a 360 dp) el hueco entre el icono y su rótulo, o el aire dentro de un chip, se
 * resuelve en 3, 5 o 7 — no en 4 ni en 8. Declarar base 2 y dejar 450 usos fuera era repetir el error
 * original con otro número: **declarar una base que el producto no usa.**
 *
 * Con los impares y los dos anchos de contenedor (18 y 22) dentro, la cobertura medida sube:
 *
 *   escala declarada               cubre      fuera
 *   base 4 (la original)           43,9 %     3.686
 *   base 2 (1.ª versión)           82,3 %     1.160
 *   base 2 + impares + 18/22       95,7 %       282   ← la que está aplicada
 *
 * Y de los 282 que siguen fuera: **77 son `1`** (un nudo de alineación, no un hueco) y el resto son
 * anchos de contenedor grandes (26, 28, 30, 40, 48, 60, hasta 130) que **no son «espaciado» sino
 * tamaño de caja** y deben ir a su familia cuando exista.
 *
 * CONCLUSIÓN QUE HAY QUE DECIR EN VOZ ALTA: esto ya **no es una progresión, es el conjunto de los
 * valores en uso, con nombre y contados uno a uno.** Es deliberado. El valor de nombrarlos no es
 * restringir —no restringe—, es que **se pueden contar y cambiar en un sitio**, que es justo lo que la
 * guardia no podía hacer mientras eran literales sueltos.
 *
 * Por qué el nombre es el número: en espaciado el número ES la intención — nadie dice «un hueco
 * semántico de 10». Renombrar aquí sigue siendo lo más barato de las familias. Las claves viejas
 * (`xs`, `sm`, `md`, `lg`, `xl`, `xxl`) apuntaban a 4/8/12/16/24/32 y se sustituyeron por los `eN`.
 */
export const espaciado = {
  e2: 2,
  /** Nudo corto: entre un icono y su etiqueta dentro de un chip. 181 literales. */
  e3: 3,
  e4: 4,
  /** Separación mínima dentro de una fila densa de la rejilla. 101 literales. */
  e5: 5,
  e6: 6,
  /** El aire del rótulo bajo la miniatura. 168 literales. */
  e7: 7,
  e8: 8,
  e9: 9,
  e10: 10,
  e11: 11,
  e12: 12,
  e13: 13,
  e14: 14,
  e16: 16,
  /** Ancho de contenedor: margen de una tarjeta ancha. 151 literales. */
  e18: 18,
  e20: 20,
  e22: 22,
  e24: 24,
  /**
   * LOS TRES PELDAÑOS DEL HUECO 24–32 — decisión de Bernardo, 24/09/2026 (opción A).
   * POR QUÉ: la escala saltaba de 24 a 32 y en ese hueco vivían 26 (12 usos), 28 (19) y 30 (27) =
   * **58 usos** que se escribían a mano. Los otros 8 sueltos de esa franja (15, 17, 3,5, 2,5) se
   * revisan uno a uno, que son ocho.
   * LA ALTERNATIVA ERA UNIFICAR A 28, y se descartó: convertía tres valores en uno y **movía 39
   * sitios**. Esto no mueve ninguno — es la misma clase de decisión que los impares de `e3/e5/e7`:
   * nombrar lo que ya se escribe, no corregirlo. Con ellos la escala cubre el 99,8 % de los huecos.
   */
  e26: 26,
  /** Separación entre bloques de una ficha. 19 literales. */
  e28: 28,
  /** Aire de un bloque de contenido ancho. 27 literales. */
  e30: 30,
  e32: 32,
} as const;

/**
 * RADIOS — cuatro formas para todo (antes 42 valores distintos).
 *
 * AMPLIACIÓN DEL 24/09/2026: `radios` está BIEN adoptada (702 usos en 168 ficheros, la segunda mejor
 * del kit), así que **los cuatro valores existentes no se han tocado**. Lo que faltaba eran los dos
 * valores que el código más escribe a mano y que la escala no contenía:
 *   · `14` → **168 literales**, el valor más escrito del proyecto.
 *   · `10` → **142 literales**.
 * Más `6` (60 literales entre 4 y 6) y `20` (99 entre 18, 20 y 22). Los nombres siguen la regla del
 * kit —intención, no tamaño— y son `marca`, `chip`, `campo` y `tarjeta`.
 */
export const radios = {
  /** Micro-marca: un punto, un contador de aviso. 6 px. */
  marca: 6,
  /** Sellos, chips y etiquetas pequeñas. */
  sm: 8,
  /** Chip de filtro. 10 px. */
  chip: 10,
  /** Campos de formulario y tarjetas pequeñas. */
  md: 12,
  /** Campo, caja o contenedor de contenido. 14 px. */
  campo: 14,
  /** Tarjetas y hojas. */
  lg: 16,
  /** Tarjeta con foto. 20 px. */
  tarjeta: 20,
  /** Píldoras y círculos. */
  full: 999,
} as const;

export type TamanoTexto = keyof typeof tipografia;
export type Espaciado = keyof typeof espaciado;
export type Radio = keyof typeof radios;

/**
 * GROSORES DE TRAZO — auditoría de micro-interacciones, Fase 0.
 *
 * POR QUÉ EXISTE: la auditoría midió **nueve grosores distintos** escritos a mano entre bordes e
 * iconos: `StyleSheet.hairlineWidth`, 1, 1.5, 2, 3 (como borde) y 1.8, 2, 2.2, 3 (como `strokeWidth`
 * de icono). Un icono con 1.8 junto a otro con 2.2 en la misma fila se nota, aunque no se sepa decir
 * por qué.
 *
 * REGLA: el grosor **no** es decoración, dice jerarquía. Un borde que separa es `fino`; uno que
 * delimita un control es `base`; uno que marca algo elegido es `fuerte`.
 */
export const trazo = {
  /** Separadores y líneas de lista. Antes `StyleSheet.hairlineWidth` o 1 según el fichero. */
  fino: 1,
  /** Borde de un control: campo, casilla, celda de código. Antes 1.5 en el kit y 1 en las pantallas. */
  base: 1.5,
  /** Borde de algo elegido o marcado. */
  fuerte: 2,
  /** Trazo de un elemento activo sobre fondo con contraste (iconos de estado). */
  marcado: 2.5,
  /**
   * ANILLO — el peldaño del avatar con borde (decisión del 25/09/2026, tanda `B1`).
   *
   * POR QUÉ EXISTE: al tokenizar `borderWidth` aparecieron **6 sitios con `3`** que la escala no
   * contenía, y los seis eran la MISMA cosa: el anillo que separa un avatar, un logo o un marco del
   * fondo — `profile.tsx` (avatar 76), `lifebook-user.tsx` (86), `lifebook-shop/[id].tsx` (logo 74),
   * `lifebook-merchant-settings.tsx`, `edit-profile.tsx` (84) y `agente-escaner.tsx` (marco 230).
   *
   * No es un borde: un borde delimita un control y va dentro de su caja; un anillo se dibuja SOBRE el
   * contenido y su grosor crece con el tamaño del avatar para que la proporción se mantenga. Por eso
   * no cabía en `fuerte` (2) ni en `marcado` (2.5): es más grueso a propósito.
   *
   * Se declara el valor que el producto ya escribe, así que los 6 sitios entran **sin mover un píxel**.
   * Mismo criterio que los peldaños `e18`/`e22`/`e26`/`e28`/`e30` del espaciado: nombrar lo que existe,
   * no corregirlo.
   */
  anillo: 3,
} as const;

/**
 * GROSORES DE TRAZO DE ICONO (`strokeWidth` de un SVG).
 *
 * POR QUÉ EXISTE: la escala de arriba es la del BORDE, y el kit la declaró a medias. El producto usa
 * además **cuatro grosores como trazo de icono** escritos a mano —`1.8`, `2`, `2.2`, `3`— y no estaban
 * en ningún sitio. Un icono con 1.8 junto a otro con 2.2 en la misma fila se nota, aunque no se sepa
 * decir por qué.
 *
 * La escala del borde NO sirve para esto: 1.5 y 2.5 son valores de borde, no de dibujo de icono. Son
 * dos escalas distintas porque miden cosas distintas, igual que `tipografia` e `icono`.
 */
export const trazoIcono = {
  /** Icono pequeño y denso. */
  fino: 1.8,
  /** Icono de fila o de botón: el caso más común. */
  base: 2,
  /** Icono de acción principal. */
  fuerte: 2.2,
  /** Icono de estado o de acento. */
  marcado: 3,
} as const;

/**
 * ALTURAS TÁCTILES.
 *
 * El mínimo de `punto` no es un valor estético: **44 dp** es el mínimo que pide la plataforma
 * (Apple HIG) y 48 el que recomienda Android.
 *
 * ── CENSO REAL DE BLANCOS TÁCTILES PEQUEÑOS (24/09/2026, Fase 2) ────────────────────────────────
 * Aquí había escrito antes que la auditoría había encontrado «la casilla del carrito (21) y el
 * micrófono del buscador (28)». **El micrófono no existía**: era una nota sin comprobar. El censo
 * de verdad, medido sobre los `StyleSheet` del proyecto, es:
 *
 *   · **152 objetos de estilo** con `width` y `height` explícitos por debajo de 44 dp.
 *   · **39 con nombre de control** (el resto son decoración: avatares, puntos, banderas).
 *   · `lifebook` concentra **15** de esos 39; el Mercado, ninguno.
 *
 * Y el censo trae la conclusión que ahora manda: **casi todos viven en una fila con `gap`**, y ahí
 * subir la caja a 44 NO es gratis — el `gap` se mide entre las cajas, así que la separación visible
 * crece sola (de 8 a 24 en el caso medido). Solo el control SUELTO admite el patrón que sí funciona:
 *
 *   `Pressable` a `altura.punto` (44) con el visual centrado dentro → el dedo gana, el diseño no
 *   cambia. Aplicado a la casilla del carrito (`lifebook-carrito.tsx`): 44 de dedo, 21 de ojo.
 *
 * En una fila con `gap` la decisión es del dueño del producto, control a control, mirando la
 * pantalla. Hasta que se decida, la medida honesta es `hitSlop` **por lado**, que lleva el área
 * táctil a 44 sin mover un píxel: mejora sin disfrazar el problema.
 */
export const altura = {
  /** Mínimo tocable. Por debajo de esto, el dedo falla. */
  punto: 44,
  /** Celda de código, casilla grande, botón de icono. */
  control: 46,
  /** Campo de formulario. Lo usa `FormField.tsx` (caja de una línea). */
  campo: 50,
  /** Botón principal. Lo usa `PrimaryButton.tsx`. */
  boton: 52,
} as const;

/**
 * TAMAÑOS DE ICONO.
 *
 * La auditoría encontró **18 tamaños entre 9 y 92** sin escala. Estos cinco cubren los usos reales;
 * los grandes de verdad (un corazón de doble toque a 76-92 px) son **decorativos y van aparte**, en
 * el componente que los usa, porque no son «el tamaño de un icono» sino el de un efecto.
 */
export const icono = {
  /** Dentro de texto o junto a una etiqueta pequeña. */
  micro: 12,
  /** Icono de fila, chip o botón compacto. */
  sm: 16,
  /** Icono de botón estándar y de barra inferior. */
  md: 20,
  /** Icono de acción principal o de cabecera. */
  lg: 24,
  /** Icono de un estado vacío. */
  hero: 32,
} as const;

/**
 * TAMAÑOS DE ILUSTRACIÓN.
 *
 * POR QUÉ EXISTE: un emoji no es texto ni es icono, y al no tener escala propia se escribía suelto.
 * El módulo Mercado tenía **ocho tamaños distintos —18, 22, 30, 34, 36, 38, 40 y 56— para la MISMA
 * pieza**: el emoji de un estado vacío y el sustituto de la foto de un producto. Ninguna de las dos
 * escalas vecinas sirve para medirlo: `tipografia` tiene su techo en `display` (28) y es para
 * CIFRAS —un emoji de 56 no es «letra grande»—, e `icono` llega a 32 y mide trazo SVG, no un glifo
 * que dibuja el sistema operativo.
 *
 * REGLA: el sujeto manda. Si el emoji ES la pantalla (estado vacío, hueco sin foto) va `md`; si va
 * en línea, dentro de una fila o una etiqueta, va `sm`; si sustituye a una foto grande, `lg`.
 *
 * Nota de rumbo: la fase 5 del plan de diseño sustituye el emoji por un set propio. Esta escala
 * sobrevive a ese cambio —lo que mide es el hueco, no el dibujo—, pero los valores se revisarán
 * entonces.
 */
export const ilustracion = {
  /** Emoji en línea, dentro de una fila o una etiqueta. */
  sm: 20,
  /** Estado vacío, o hueco de foto de una tarjeta. */
  md: 36,
  /** Sustituto de una foto grande (la ficha de un producto). */
  lg: 56,
} as const;

export type Trazo = keyof typeof trazo;
export type TrazoIcono = keyof typeof trazoIcono;
export type Altura = keyof typeof altura;
export type Icono = keyof typeof icono;
export type Ilustracion = keyof typeof ilustracion;
