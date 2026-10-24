---
name: clonar-xhs
description: Clonar funcionalidades de chat/tarjetas de Xiaohongshu (Red Book) en LifeBook alineándose a la evidencia RE del APK. Úsalo ANTES de implementar o modificar cualquier tarjeta, chip, mención, mensaje, panel o ajuste del chat: primero se extrae el contrato real (DSL/clases/strings), y si falta material se vuelve a hacer ingeniería inversa. Es la norma de trabajo: no inventar y no depender de que el humano lo recuerde.
---

# Clonar una función de Xiaohongshu (Red Book) en LifeBook

**Regla de oro:** ninguna pantalla, tarjeta, chip ni texto se implementa “a ojo”. Todo sale de
**evidencia del APK** (`D:\Tools\rea-analysis\jadx-out`). Si la evidencia no llega, **se extrae más**
(volver a hacer RE), no se rellena con suposiciones.

## Flujo obligatorio

1. **Localizar la función en el APK**
   - Clases/actividades: `node tools/re-xhs.mjs class <regex>`
   - Cadenas en español/chino: `node tools/re-xhs.mjs strings <texto>`
   - DSL de tarjetas: `node tools/re-xhs.mjs dsl <nombre>` (p. ej. `bcim_chat_intention_23`)
2. **Extraer el contrato exacto**
   - Tarjetas: `dsl.json` (nodos, medidas, colores, `$expr`), `eval.json`, `assets/`.
   - Modelos: campos de la clase (Java decompilado), contentType en `XYBCIMMessageType`.
   - Comportamiento: adaptadores/DIALOG/actividades (cuántos elementos, tamaños, acciones).
3. **Escribir la tabla de correspondencia** (RE → LifeBook): campo RE → campo nuestro, gesto → gesto.
   Si algo no tiene equivalente, se anota como **hueco** y se decide antes de codificar.
4. **Implementar el clon** respetando la forma RE (medidas, radios, tamaños de texto, límites,
   colores) y las convenciones del repo (`file:line`, comentarios con la evidencia).
5. **Validar en el móvil** (no basta API): captura y comprobación visual; si es un dato, también API.
6. **Documentar**: sección en `docs/WP2-…md` con la evidencia (`archivo:línea`) y lo que queda.

## Evidencia disponible (no hace falta re-RE si está aquí)

- Referencia completa de tarjetas: `docs/WP1-MENSAJES-XIAOHONGSHU-Y-PLAN.md`,
  `docs/WP2-TARJETAS-ENTREGA-CUPON-Y-MENSAJES.md`.
- Informes de subagentes: `D:\temp\egapp-validate\re\` (RE-DSL-3-familias.md,
  ESTADO-ACTUAL-cupon-entrega-mensajes.md).
- APK decompilado: `D:\Tools\rea-analysis\jadx-out` (src de Java + `nosrc/resources/assets/dsl`).
- Helper: `tools/re-xhs.mjs` (dsl / class / strings / grep).

## Ejemplos ya hechos (usar como patrón)

- **Respuestas rápidas**: `INTENTION(23)`/`INTENTION_OPTION(21)`; DSL `bcim_chat_intention_23`:
  burbuja radio 12, padding 12/8, texto 16/20, propio azul `#3D8AF5`; el adaptador muestra
  `Math.min(size,3)`; `QuickIntent*` lleva `icon`+`event`/`jumpLink` (destino a producto/grupo).
- **Menciones**: `strings.xml` «有人@你»; formato `@` + nickname visible; aviso propio.
- **Confirmación de entrega**: `askconfirmorder_71` (goods/address/status/buttons).

## Prohibiciones

- ❌ Inventar campos o gestos que la referencia no tenga (si se añade algo propio, se marca como
  «propio de LifeBook» y se explica por qué).
- ❌ Dar por bueno un clon sin captura en el dispositivo.
- ❌ Repetir el patrón “lo arreglo y luego miro RE”: primero RE, después código.
