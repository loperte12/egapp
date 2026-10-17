# La ley del proyecto

**Qué es esto.** Una página de reglas de trabajo, no de código. Existe porque en la línea del Mercado
cada fase chocó **siempre por lo mismo**, y no era falta de material ni de esfuerzo: era falta de
**método**. Esto lo fija. Si una decisión contradice esta página, se discute aquí primero.

**Fecha**: 17/10/2026 · **Decisión del dueño del producto**: avanzar con **B + A, con C de disciplina**
(congelar el núcleo compartido, ficha por módulo, un módulo en vuelo).

---

## 1 · Las cinco reglas (cada una nació de un choque real)

1. **El nombre de la pantalla no es la especificación.** Antes de construir un módulo se escribe su
   **diccionario**: qué significa cada palabra del módulo en la app de referencia y en la nuestra.
   *(Nació de «关注»: allí es un feed de contenido; aquí era una lista de comerciantes —
   `ESQUEMA-关注-TAOBAO.md`.)*
2. **Inventario de material ANTES de planificar.** No se aprueba un módulo sin una búsqueda **con
   prueba** de que el material tiene el comportamiento que se quiere copiar.
   *(Nació del «panel» de Qianniu: 24 MB que eran un **instalador**, no el panel — `CONTINUAR-MERCADO.md`
   §31.)*
3. **El material no se monta: se traduce.** Un hallazgo entra en la app **sólo por una costura**
   (§3). Si no cabe, **se para** y se decide (ADR); no se fuerza.
   *(Nació del contrato de árbol frente a las pantallas ya escritas.)*
4. **Primero la fábrica, luego los módulos.** Un módulo no puede ser «firme» sobre una cadena de
   entrega que miente. Antes de un módulo, la fábrica está sana: lo que se despliega es lo que está en
   git, y las guardias corren solas.
   *(Nació del despliegue que empujaba sólo 2 ficheros y del backend fuera de git.)*
5. **Dos carriles: RE investiga, construir construye.** La RE produce **fichas** (sin código); la
   construcción consume fichas (sin material). Nunca las dos cosas en el mismo paso.
   *(Nació de leer material y desplegar en el mismo turno, y enterarse de los fallos en el móvil.)*

---

## 2 · Los dos carriles

```
RE (investigación)                     CONSTRUCCIÓN (ingeniería)
─────────────────                     ─────────────────────────
captura / APK / panel                  ficha aprobada
        │                                     │
        ▼                                     ▼
  inventario de material  ──►  ficha  ──►  rebanada con flag  ──►  verificación  ──►  retirada
  (¿está? ¿con prueba?)        (6 partes)   (una sola)            (tests + móvil)     (lo viejo)
```

**La ficha es el único contrato entre los dos carriles.** Un carril no manda código al otro.

---

## 3 · Las tres costuras (y lo que está congelado en cada una)

| Costura | Qué es | Dónde vive | Estado |
|---|---|---|---|
| **1 · Contrato** backend↔app | `{esquema, arbol, datos}` con 14 tipos de widget; esquema versionado; si no coincide, **no se pinta** | `components/ecomerse/uiContrato.ts` (65 líneas, `ESQUEMA_UI = 1`) · `api/ecomerseUi.ts` (156) | congelada: política y tipos en [CONTRATO-UI.md](CONTRATO-UI.md); tres copias de la versión fijadas por `contratoVersion.test.mjs` |
| **2 · Kit y motor de UI** | widgets (`Contenedor`, `Texto`, `Imagen`, `Lista`, `Precio`, `Pestanas`…), tablas de claves **puras** y tokens de diseño: **no se escribe hexadecimal fuera de los tokens** | `components/ecomerse/` (26 componentes + 25 módulos puros) · `npm run diseno` | congelada: guía en [KIT-UI.md](KIT-UI.md) (dos capas, receta, las 2 lecciones, tokens) y `kit.test.mjs` fija registro completo y «nunca lanza» |
| **3 · Cadena de entrega** | un despliegue que publica **exactamente lo commiteado**, guardias (`tsc`, oráculo, diseño, rutas) y **una** forma de verificar en el móvil | `pruebas/desplegar-ui-mercado.cjs` (6 ficheros hoy) · `mercado-fase1/o1-oraculo` (13 ficheros, 148 pruebas) · `package.json` | **a medias**: la lista de ficheros sigue escrita a mano y las guardias son manuales |

**Regla de costura**: lo que no entra por una costura no entra en la app. Cambiar una costura es un
**ADR**, no un commit de paso.

---

## 4 · Definición de FICHA (el estándar, ver `PLANTILLA-FICHA-MODULO.md`)

Seis partes, siempre las mismas: **evidencia · alcance de AHORA · costura · aceptación · fuera de
alcance · coste**. Una ficha sin una de las seis no está lista para aprobar.

## 5 · Definición de HECHO (las cinco comprobaciones)

1. **Tests**: el oráculo/unitarios cubren lo nuevo y **fallan antes** de estar implementado.
2. **Guardias**: `tsc` sin errores nuevos, `npm run diseno` verde, `logica` y `rutas` verdes.
3. **Móvil**: comprobado en el aparato, con captura, en **dos estados** (el normal y el de fallo).
4. **Despliegue**: lo que está en producción **es lo que está en git** (mismo sha de fichero, publicado).
5. **Retirada**: si sustituye a algo, lo viejo **se borra en el mismo commit**; si no puede, se declara
   por qué y con fecha.

Sin las cinco no está hecho. «Casi» no está en esta lista.

---

## 6 · El ciclo de un módulo (C: uno en vuelo)

1. **Diccionario** del módulo (las palabras y sus dos significados).
2. **Inventario de material** con prueba (qué fichero/captura lo demuestra; qué **no** está).
3. **Ficha** de la primera rebanada → **aprobación** del dueño del producto.
4. Implementación **detrás de un flag**, con sus tests escritos antes.
5. Verificación (las cinco comprobaciones).
6. **Retirada** de lo viejo en el mismo commit.
7. Doc: `CONTINUAR-<módulo>.md` + evidencia (capturas, medidas).
8. Sólo entonces: la **siguiente** rebanada o el siguiente módulo.

**Máximo un módulo en vuelo.** Un módulo puede tener varias rebanadas, pero se cierran de una en una.

---

## 7 · Lo que NO se hace (las trampas)

- **No** se planifica un módulo sin inventario de material.
- **No** se mezcla RE y construcción en el mismo paso.
- **No** se inventa lo que falta: **se declara** y se pide la captura.
- **No** se cierra nada «mirándolo»: se cierra con test **y** móvil.
- **No** se reescribe la app. Si un módulo es >70 % distinto, se hace **módulo nuevo dentro de la app**,
  con flag, y se retira el viejo.
- **No** se toca la rama principal sin commit limpio y reversible.

---

## 8 · Cómo se prioriza

Por **calidad de material**, no por ganas:

1. Módulos con **captura de red** (la mejor evidencia: el árbol completo).
2. Módulos con **capturas de pantalla** de sus estados.
3. Módulos cuyo material es un **instalador/bootstrapper** → **al final** (o se instala y se captura).

Y dentro de un módulo: primero lo que **desbloquea el resto** (la pantalla que todos usan), después el
detalle.

---

## 9 · Estado de arranque (lo que hay hoy, medido)

| Costura | Hecho | Falta |
|---|---|---|
| Contrato | esquema versionado + rechazo si no coincide + 148 pruebas | política de versión escrita · prueba de rechazo explícita |
| Kit | 26 componentes + 25 módulos puros + tokens sin hexadecimal suelto | guía «cómo se añade un widget» |
| Entrega | despliegue de 6 ficheros + 4 guardias + oráculo | publicar **desde git** · guardias automáticas · checklist de móvil único |

Y la cola de módulos (por material): **1) Mercado** (material: APK + capturas; en vuelo, casi cerrado),
**2) …** los demás **entran cuando tengan inventario**. Nada se aprueba antes.
