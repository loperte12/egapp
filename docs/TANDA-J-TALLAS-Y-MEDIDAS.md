# Tanda J — Tallas y medidas (puntos 1 y 2: los datos y la configuración)

> Estado: **servidor hecho y verificado (41/41 contra la API real)**. **La app todavía no lo usa**:
> ni el comerciante tiene pantalla para configurarlo, ni el comprador tiene el asistente. Se dice
> aquí sin rodeos. Fecha: 14/09/2026.

---

## 1. La investigación, antes de tocar nada (fue lo que cambió el plan)

Con consultas a la base, no supuesto:

| Comprobación | Resultado |
|---|---|
| Tablas de tallas/medidas (`size`, `talla`, `measure`, `fit`, `chart`) | **0** |
| Columnas de medidas en el perfil (`height`, `weight`, `chest`, `shoe`…) | **0** |
| Atributos estructurados en las variantes | **0**: las variantes solo tienen un `name` («Talla 42») |

**Conclusión**: un asistente de talla no podía recomendar nada sin inventárselo, porque la regla del
dueño es «comparar contra la tabla de medidas **del producto** que configuró el comerciante»… y esa
tabla no existía. Por eso esta tanda empieza por los datos y por la configuración.

También se investigó **dónde** va la configuración en el flujo que ya existe: el publicador tiene 6
pasos (`shop · type · media · details · **extras** · preview`), y las variantes (tallas, colores) se
editan en **`StepExtras`** — ahí es donde encaja la sección de tallas, antes de publicar.

## 2. Lo que ya funciona (DDL 015 + API)

### A. Las tablas del comerciante (`product_size_charts` + `product_size_rows`)

* **Varias tablas por producto**: por **sexo** (`women` · `men` · `unisex`) y por **tipo**
  (`top` · `bottom` · `dress` · `shoes` · `accessory` · `other`). Un producto puede tener la de mujer
  y la de hombre a la vez.
* Cada talla (S, M, L, 42…) con sus **rangos** en cm/kg: pecho, cintura, cadera, altura, peso, largo
  y ancho del pie. Son **intervalos** (min–max), porque una talla M no es un número exacto.
* La base **no deja guardar un rango al revés** (mínimo > máximo) ni medidas absurdas.
* `PUT /commerce/products/:id/size-chart` guarda las tablas de **tu** producto (hasta 6 tablas y 60
  tallas por tabla); `GET` de la misma ruta las lee **cualquiera** que mire el producto.

### B. Las medidas de la persona (`user_measurements`)

* Por **categoría independiente**: `body` (ropa) y `feet` (calzado). Tener una **no obliga** a tener
  la otra, como pediste.
* `GET/PUT /commerce/my/measurements` y `DELETE` con `?category=` (una categoría) o sin nada
  (todas). **Nunca salen de la cuenta**: el comerciante solo ve la talla elegida.
* Se rechazan valores imposibles (un pecho de 900 cm) y una categoría que no existe.

### C. La recomendación (el corazón del punto 3, ya en el servidor)

`POST /commerce/products/:id/size-suggestion` compara las medidas con **la tabla de ese producto** y
devuelve **talla + nivel de ajuste + razón**, y **dice la verdad cuando no hay tabla** en vez de
inventarse una talla.

## 3. Verificación: `pruebas/lb59a-verificar-tallas.cjs` → **41 PASA · 0 FALLA**

```
1. EL COMERCIANTE CONFIGURA SUS TABLAS      3 tablas (mujer, hombre, calzado) con sus rangos cm/kg
2. SE LEE EN PÚBLICO                        con sesión y sin ella
3. LO QUE NO TIENE SENTIDO SE RECHAZA       sexo inválido · rango al revés · tabla vacía (400)
                                            y la tabla buena NO se toca con los intentos fallidos
4. NADIE TOCA LA TABLA DE OTRO              un producto ajeno → 404
5. MIS MEDIDAS, POR CATEGORÍA INDEPENDIENTE ropa 94 cm de pecho · calzado aparte · una no obliga a la otra
6. MEDIDAS IMPOSIBLES                       pecho de 900 → 400 · sin nada → 400 · categoría mala → 400
7. LA RECOMENDACIÓN                         pecho 94 → talla L (ajuste ajustado) con su razón;
                                            pecho 84 → talla S; pidiendo hombre usa la tabla de hombre;
                                            sin la medida clave lo dice, no adivina
8. SIN TABLA CONFIGURADA NO SE INVENTA NADA «Esta tienda todavía no ha configurado su tabla de tallas»
9. BORRAR MIS MEDIDAS                       por categoría o todas, sin tocar la otra
```

## 4. Lo que FALTA (en el orden natural)

1. **La pantalla del comerciante** (dentro de `StepExtras` del publicador, antes de publicar):
   crear las tablas de mujer/hombre/unisex y sus tallas con rangos, y **editar** las existentes.
   Hoy se configuran **por API**.
2. **El bottom sheet de variantes** («Seleccionar: Talla, Color» con miniatura, tallas agotadas en
   gris, colores, cantidad, precio en vivo y los dos botones) — hoy son chips en línea en la ficha.
3. **El asistente con ruletas verticales** (tipo de cuerpo → medidas → recomendación → «Usar esta
   talla»), **dentro** del sheet, con el enlace «¿No sabes tu talla?» solo cuando el producto tiene
   tallas y tabla configurada.
4. **La persistencia en la app**: precargar las últimas medidas («Usar mis últimas medidas: 168 cm /
   60 kg / pecho 94 cm»), editarlas y poder borrarlas desde ajustes. El servidor ya lo guarda.
5. **El vídeo dentro del carrusel de la ficha** (primera posición con ▶ y contado en el indicador):
   hoy los vídeos se filtran fuera del carrusel. El indicador «1/5» **ya existe** y funciona.

## 5. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL | `/opt/mirror/app/sql/lifebook/20260214_tallas_y_medidas.sql` (copia local `backend/sql/015_tallas_y_medidas.sql`) |
| Servidor | `commerce.service.ts` (`setSizeChart`, `sizeChart`, `medidaCm`, `myMeasurements`, `setMeasurements`, `clearMeasurements`, `sizeSuggestion`) · `commerce.controller.ts` (6 rutas) · `http/error.filter.ts` (los códigos con su HTTP) |
| Parches | `parche60-tallas.py`, `parche61-http-tallas.py` |
| Prueba | `pruebas/lb59a-verificar-tallas.cjs` (41 comprobaciones) |
| Dónde va la pantalla (investigado) | `app/lifebook-sell.tsx` + `components/lifebook/publish/StepExtras.tsx` (variantes) + `state/commercePublish.ts` |
