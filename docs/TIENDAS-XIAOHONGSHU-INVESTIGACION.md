# Tiendas de Xiaohongshu — lo que se puede verificar, y qué tarjeta construimos

Fecha: 2026-09-14. Estado: **investigación parcial + propuesta**. Nada implementado.

Encargo del dueño: «investiga cómo se ven las tiendas en Xiaohongshu, su estilo, las
tarjetas, todo absolutamente todo».

## 0. Aviso primero: qué he podido verificar y qué no

Esto va delante porque condiciona todo el documento, y prefiero decirlo antes que
rellenarlo:

- **Xiaohongshu no publica un sistema de diseño.** No hay guía de estilo pública de su
  tienda ni de sus tarjetas (el centro de ayuda oficial, además, no sirve texto sin
  JavaScript). Lo que existe son **guías para vendedores** y artículos de marketing.
- **Las guías concretas no las he podido abrir**: este equipo tiene la conexión
  inestable para descargas largas (ya nos pasó antes con otras webs) y las páginas con
  los números exactos —proporciones de imagen, tamaños de tarjeta— fallaron al
  descargarse (TLS cortado y `curl` sin respuesta). **No cito números que no he leído.**
- **No puedo ver imágenes** (el modelo no acepta entrada de imagen), así que tampoco
  puedo analizar capturas.
- Lo que **sí** está verificado son las **estructuras** (dónde vive el comercio, cómo
  se entra, qué cambió y cuándo), que es lo que decide la organización. Va con fuente.

Es decir: la **anatomía visual exacta** de la tarjeta de Xiaohongshu queda
**pendiente**, y digo cómo desbloquearla en §2. Lo que sí traigo es **nuestra**
tarjeta, calculada con datos reales nuestros (§3), que es lo que hace falta para
construir.

## 1. Cómo está montado el comercio en Xiaohongshu (verificado con prensa)

| Hecho | Detalle | Fuente |
|---|---|---|
| El comercio es **entrada de primer nivel** | En agosto de 2025 la app movió la compra a la barra principal y **«商城» pasó a llamarse «市集»**, con canales fijos arriba | [东方财富](https://finance.eastmoney.com/a/202509033502672020.html) · [电商派](https://www.pai.com.cn/p/01k3r7045jmb4hcfwwna8bsjax) |
| El comercio vive **dentro del contenido**, no aparte | El motor son las **notas con producto** (`商品笔记`): una nota normal a la que se le **engancha** el producto, y en la nota se ve la etiqueta/el enlace del artículo | [php.cn](https://www.php.cn/faq/2186141.html) (SECUNDARIA) |
| Se compra **sin salir de la nota** | El enlace de compra se añade a la nota; el paso siguiente es la ficha o el carrito | [有赞](https://www.youzan.com/cms/article/77022.html) (SECUNDARIA) |
| La tienda tiene **página propia** | «店铺主页» con cabecera y secciones, y los vendedores hablan de **«装修»** (decorarla): eso confirma que hay una página configurable con componentes | [guía de 装修](https://www.xiao-ad.com/jd/3691.html) (BLOG) |
| **Directos** (直播) como canal de venta | Es una de las tres patas junto a la nota con producto y la tienda | [雷锋网](https://www.leiphone.com/category/industrynews/3wvzaUVmeou0FBsz.html) |

**Lo que esto significa para nosotros:** el patrón real de Xiaohongshu **no es un
escaparate**, es **contenido que lleva producto dentro**. Nuestra app ya tiene
exactamente esa forma: publicaciones `type='sale'` (103 activas) que son contenido
normal con un artículo detrás. **Vamos por el camino correcto sin haberlo copiado.**

## 2. Anatomía de la tarjeta de Xiaohongshu — PENDIENTE, y cómo cerrarla

Lo que **no** puedo afirmar hoy: proporción de la imagen, número de líneas del título,
tamaño y color del precio, qué etiquetas lleva (cupón, envío, «已售 N»), dónde va la
valoración y si se enseña el nombre de la tienda. Cualquier cosa que escribiera aquí
sería invención mía, y ya nos ha costado caro deducir en vez de medir.

**Tres formas de cerrarlo, por orden de coste:**

1. **Tú, con la app delante**: abre una tienda de Xiaohongshu y dime qué ves en la
   tarjeta de un producto (de arriba abajo) y en la cabecera de la tienda. Con eso
   escribo la anatomía exacta en una tarde, sin inventar nada.
2. **Yo, con la conexión estable**: si en algún momento este equipo descarga bien las
   guías de vendedores, extraigo las medidas reales (proporciones, tamaños, colores) y
   lo documento con la fuente al lado.
3. **Capturas de pantalla**: no me sirven directamente (no puedo ver imágenes), pero
   **sí sirven si tú me describes lo que se ve**. No hace falta instalar nada.

## 3. La tarjeta que SÍ podemos construir hoy (con nuestros datos)

Esto es lo que de verdad desbloquea el trabajo, y sale de la base de datos, no de una
web. **Esto es el payload real de una venta nuestra:**

```json
{"category":"moviles","delivery":["recogida","domicilio"],"priceXaf":185000,
 "condition":"como_nuevo","negotiable":true,"contactMode":"inapp",
 "paymentMethods":["efectivo","monedero"]}
```

Y estos son los números reales: **103 publicaciones de venta activas** (de 1 002),
**1 vendedor** con **11 productos**, **9 pedidos** ya hechos, 8 restaurantes, 10
inmuebles, 13 trabajos. Hay flujo de verdad, poco pero real.

### Tarjeta propuesta (2 columnas, como la rejilla de Xiaohongshu)

```
┌──────────────────────┐
│                      │  ← FOTO (proporción 3:4, cover: la misma que ya usa
│        FOTO          │     el carrusel del detalle)
│                      │
├──────────────────────┤
│ 185.000 XAF          │  ← PRECIO en grande y en negrita (es lo que se busca)
│ Móvil como nuevo     │  ← CONDICIÓN, en pequeño: «como nuevo · usado · nuevo»
│ 📍 Recogida o a casa │  ← ENTREGA, si la declara
│ Pago: monedero       │  ← FORMA DE PAGO, la primera que acepte
│ [Negociable]         │  ← ETIQUETA, solo si `negotiable` es true
└──────────────────────┘
```

- **Qué copiamos de Xiaohongshu**: la **rejilla de 2 columnas con foto vertical 3:4**,
  el **precio mandando** y las **etiquetas cortas** sobre la foto.
- **Qué NO copiamos, y por qué**: cupones, «已售 N», envío gratis, valoración del
  producto, carrito y variantes. Aquí **no existen**: no hay stock, ni logística, ni
  pasarela de marketplace. Poner «envío gratis» o «1.2k vendidos» sería **mentir en la
  interfaz**, que es el peor sitio para mentir.
- **Lo que sí es nuestro y hay que enseñar**: **entrega** (recogida o a domicilio),
  **formas de pago** (efectivo o monedero — muy relevante aquí) y **negociable**, que
  además es culturalmente importante en este mercado.
- **Contacto**: en Xiaohongshu se compra dentro de la app. Aquí el `contactMode` es
  `inapp` (chatear con quien vende), así que el botón de la ficha es **«Escribirle»**,
  no «Comprar».

### Dónde vive

En el chip **«Comercio»** del feed, que **ya existe como canal** (`channel=sales`,
filtra `type='sale'`): cero backend. La ficha de producto es la pantalla que ya hay
para una venta; lo único nuevo es la **tarjeta de la rejilla**.

## 4. Lo que NO he podido verificar (lista explícita)

1. **La anatomía exacta** de la tarjeta de producto de Xiaohongshu (proporción,
   tipografías, tamaños, colores, etiquetas).
2. **La cabecera de la tienda** (qué distintivos enseña, si lleva 粉丝/好评率, qué
   pestañas internas tiene).
3. **Las medidas de imagen** que piden a los vendedores (las guías existen — [1](https://www.airmie.cn/News/fenxiang/platform-xiaohongshu-2026.html),
   [2](https://www.biaojixia.com/specs/xiaohongshu?scenario=spec-xiaohongshu) — pero **no pude descargarlas**).
4. El **estado actual** de la pantalla de 市集 (canales, orden de secciones).
5. Si el rojo `#FF2442` sigue siendo el color de marca y cómo se usa en el comercio.
6. Todo lo que depende de **ver** la app, que no puedo.

## 5. Qué propongo hacer con esto

1. **Construir la tarjeta de §3** (una tarde, solo app: es una tarjeta nueva en la
   rejilla de ventas + el chip «Comercio», que ya tiene canal).
2. **Cerrar §2 contigo** (o con conexión estable) antes de copiar nada visual: prefiero
   una tarjeta nuestra honesta que una copia mal medida.
3. **No** prometer en la interfaz nada que no exista: sin cupones, sin envío, sin
   valoraciones de producto.
