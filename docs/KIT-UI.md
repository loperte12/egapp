# El kit de UI: cómo se añade un widget (y las dos lecciones que nos costaron días)

**Qué es este documento.** La guía de la **costura 2** de la [ley](LEY-DEL-PROYECTO.md) §3: cómo se
añade o se cambia un widget del kit sin romper el motor, sin inventar claves y sin volver a los dos
fallos de maquetación que ya nos costaron días. Si el código y este documento se contradicen, se para y
se decide: no se «arregla» el documento para que diga lo que hace el código.

**Estado**: kit congelado el **17/10/2026** · **26 componentes** y **25 módulos puros** en
`components/ecomerse/`.

---

## 1 · Las dos capas (y por qué están separadas)

```
components/ecomerse/
├── <widget>Atributos.ts   ← CAPA 1: puro. Claves, enums, confianza y resolución. Sin React.
├── <Widget>.tsx           ← CAPA 2: el componente. LEE la resolución. No decide nada.
└── Renderizador.tsx       ← el motor: recorre, filtra por lista blanca y reparte props.
```

**La regla que hace que esto funcione**: **toda la decisión vive en la capa 1**, y la capa 2 sólo pinta
lo que la capa 1 resolvió. Motivos, los dos medidos:

1. **El oráculo importa la capa 1 directamente** (Node, sin React, sin compilar). Eso es lo que permite
   probar en un segundo lo que si no serían dos minutos de bundle y un móvil.
2. **Una decisión en un `.tsx` no se puede probar.** Y las decisiones que no se prueban se degradan.

---

## 2 · La receta (siete pasos)

### Caso A · Un componente para un tipo que YA existe (lo normal)

Ejemplo real: `Precio` y `Icono` son componentes; sus tipos ya están en la lista blanca. **Esto no
cambia el contrato.**

1. **La clave, medida.** Antes de escribir nada: la clave `long` sale del APK
   (`tabla-claves.json`), no se inventa. Si no está medida, **no se usa** (o se marca `inferido` con su
   confianza y se dice).
2. **La tabla pura** `<widget>Atributos.ts`:
   ```ts
   export const CLAVES_X = { TEXTO: '00000008e396ac59', … } as const;
   export type NombreAtributoX = keyof typeof CLAVES_X;
   /** De dónde sale cada clave: 'motor' (leída del motor), 'tabla' (del APK), 'alta'/'media' (inferida). */
   export const CONFIANZA: Record<NombreAtributoX, 'motor' | 'tabla' | 'alta' | 'media'> = { … };
   export function resolverX(dx: AtributosDxX = {}): ResolucionX { … }  // puro, sin lanzar
   ```
3. **El componente** `<Widget>.tsx`: lee `resolverX(dx)`, aplica `estiloDeCaja(dx)` de
   `layoutAtributos.ts` (la caja compartida: medidas, márgenes, visibilidad, accesibilidad) y **nada
   más**. Si te encuentras escribiendo un `if` de negocio en el `.tsx`, va a la capa 1.
4. **Registro** en `Renderizador.tsx` → `COMPONENTES` (un mapa `tipo → componente`). Si el tipo no está
   ahí, el nodo cae en el **marcador de «sin componente»** y se ve un hueco.
5. **Pruebas** en el oráculo (`mercado-fase1/o1-oraculo/test/`): que las claves son **las reales**, que
   los enums tienen los valores del motor, y que la resolución devuelve lo que debe (incluido el caso
   vacío: **nunca lanza**).
6. **Guardias**: `npm run verificar` (incluye `diseño`, que impide hexadecimal fuera de tokens).
7. **Documento**: si el widget tiene una decisión que no es obvia, se escribe aquí o en el propio
   módulo; si es un tipo nuevo, además en `CONTRATO-UI.md`.

### Caso B · Un TIPO nuevo (esto SÍ es cambiar el contrato)

Además de lo anterior: `TIPOS_SOPORTADOS` en `renderizadorNucleo.ts` (tipo canónico + alias reales),
la fila en la tabla de `CONTRATO-UI.md` §4, el test `contratoVersion.test.mjs` actualizado **a
propósito**, y **subir la versión del esquema a 2** — porque un tipo nuevo es, por definición,
incompatible con un cliente viejo (§3.2 de `CONTRATO-UI.md`). Los dos lados en el mismo despliegue.

---

## 3 · Las dos lecciones (doctrina, no anécdota)

### Lección 1 · Un `Texto` **nunca** lleva claves de colocación

**El fallo**: en la sección de seguidos, la tarjeta de vacío salió con su botón «Actualizar» y **sin su
título ni su texto**. A los textos se les había puesto `LAYOUT_WIDTH: -1`, que es lo que usa un
**Contenedor** (y una `Imagen`) para ocupar el ancho.

**Por qué rompe**: `-1` es una convención **de caja** (`match_parent`). En un `Texto`, esa clave viaja al
estilo y el rótulo queda **invisible**. No lanza, no avisa: desaparece.

**La regla**: `LAYOUT_WIDTH`, `LAYOUT_HEIGHT`, `WEIGHT` y `ORIENTATION` son **sólo de Contenedor**. En un
`Texto` se coloca con **`PADDING_*`** (que sí es vocabulario de caja compartido y en un texto es
legítimo), `MAXWIDTH`/`MAXLINES` (de texto) o el contenedor que lo envuelve.

**El guardián**: `test/claves.test.mjs` → «un texto con una clave de contenedor sale INVISIBLE en el
móvil». Recorre **todos los árboles** del servidor y falla si un `Texto` lleva una de esas cuatro
claves. La lista sale de la tabla del `Contenedor` **por nombre**, no de hexadecimales a mano.

### Lección 2 · La celda de una `Lista` de **una columna** necesita ancho

**El fallo**: las tarjetas de la lista de seguidos se veían como cajas estrechas y vacías.

**Por qué rompe**: la lista no virtualizada construye **filas flexbox**; en una fila, la celda mide su
**contenido**. Una tarjeta hecha sólo de textos (sin imagen que le dé ancho) se **colapsa**.

**La regla**: en una `Lista`, la celda vertical lleva **`flex: 1`** (o `flex: span` si la rejilla reparte
columnas). Está en `components/ecomerse/Lista.tsx`, con el comentario del porqué.

**El guardián**: **no hay test automático** — es visual y depende del layout. Se comprueba en el
checklist de móvil (`VERIFICACION-MOVIL.md` §1) y por eso está aquí escrito: es la clase de fallo que un
test ligero no ve.

---

## 4 · Los tokens (color, espacio, tipografía)

- **La definición** vive en `packages/ui-kit/src/theme/` (`colors.ts`, `escalas.ts`). Ahí un `#RRGGBB` o
  un `borderRadius: 20` **no es deuda**: es la escala que se declara.
- **El consumo** es por `@egrouteplan/ui-kit`: `useTheme()` y las escalas (`espaciado`, `radios`,
  `tipografia`, `peso`, `trazo`, `alpha`, `elevation`, `icono`…).
- **La regla**: fuera de `theme/` **no se escribe hexadecimal ni un radio a mano**. Lo impone
  `npm run diseno` (y el despliegue lo exige). El kit **sí** entra en esa comprobación, salvo `theme/`.
- Si un color o una medida no está en la escala: **se añade a la escala**, no al componente.

---

## 5 · Checklist antes de dar un widget por hecho

- [ ] La clave está **medida** (o declarada como inferida, con su confianza).
- [ ] La decisión está en la **capa 1** (puro); el `.tsx` sólo lee.
- [ ] La caja viene de `estiloDeCaja(dx)` — no hay márgenes ni medidas a mano.
- [ ] **Ningún `Texto` con `LAYOUT_WIDTH`/`LAYOUT_HEIGHT`/`WEIGHT`/`ORIENTATION`.**
- [ ] Si va en una `Lista`: la celda vertical tiene **`flex: 1`**.
- [ ] Está en `COMPONENTES` (y, si es tipo nuevo, en `TIPOS_SOPORTADOS` + contrato + versión).
- [ ] Sin hexadecimal: sólo tokens.
- [ ] Pruebas en el oráculo (claves reales, enums, resolución, y que **no lanza** con vacío/basura).
- [ ] `npm run verificar` en verde.
- [ ] Mirado en el móvil en los **dos estados** (`VERIFICACION-MOVIL.md`).

---

## 6 · Dónde están las pruebas del kit

| prueba | qué fija |
|---|---|
| `test/claves.test.mjs` | claves **reales** contra `tabla-claves.json` · enums del motor · **ningún texto con clave de colocación** · `Condicional` fuera de `COMPONENTES` |
| `test/contratoVersion.test.mjs` | la lista de 14 tipos congelada, alias sin colisiones, versión única |
| `test/kit.test.mjs` | **todos los tipos tienen componente** (salvo `Condicional`) · **ningún resolutor lanza** con atributos vacíos ni con basura |
| `npm run diseno` | tokens: nada de hexadecimal fuera de `theme/` |
| `npm run verificar` | todo lo anterior, en un comando, antes de publicar |
