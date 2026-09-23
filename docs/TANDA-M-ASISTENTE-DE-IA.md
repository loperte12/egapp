# Tanda M — El asistente de IA de Life Book

> Estado: **servidor desplegado y verificado con el modelo real (18/18)**, **app compilada e
> instalada**; falta mirarlo en pantalla (lo prueba el dueño). Fecha: 15/09/2026.

---

## 1. Qué es y qué NO es

Un **chat dentro de Life Book** que:

* **recomienda cosas REALES** del catálogo: los productos y tiendas que enseña salen de la base, con
  su precio y su ciudad verdaderos, y se pueden abrir con un toque;
* **explica cómo se usa la app** (publicar, tallas y medidas, aviso de reposición, cupones, carrito,
  ciudad y distancia, alojamiento, formas de pago) con textos escritos en esta casa, no inventados
  por el modelo.

Y lo que **no hace, a propósito**:

* **no inventa** productos, precios, existencias ni plazos: si una búsqueda no devuelve nada, dice
  que no hay nada (comprobado: a «xilófono de titanio para ballenas» responde «No hay nada con eso en
  el catálogo»);
* **no ve datos personales**: las herramientas solo leen el catálogo PÚBLICO. No hay ninguna que
  lea teléfonos, correos, direcciones, pedidos de otros ni medidas corporales (y el prompt se lo
  prohíbe expresamente);
* **no compra nada** ni sugiere pagar fuera de la app.

## 2. Dónde vive

En la **barra de Life Book**, en el hueco que quedó libre cuando el avatar del dueño se mudó a
Mensajes (era su sitio previsto). El icono abre `app/lifebook-ai.tsx`: un chat con la conversación,
las tarjetas de productos/tiendas y el cuadro para escribir.

## 3. Cómo funciona (servidor)

| Ruta | Qué hace |
|---|---|
| `GET /lifebook/ai/state` | ¿está configurado? ¿modelo? ¿cuántos mensajes quedan hoy? |
| `GET /lifebook/ai/chat` | la conversación abierta con sus mensajes y sus tarjetas |
| `POST /lifebook/ai/chat` | mandar una pregunta |
| `POST /lifebook/ai/new` | empezar de cero (la anterior se queda guardada) |

Todas **exigen sesión** y el usuario sale del token: nadie puede leer la conversación de otro ni
gastar su cupo (comprobado: otra cuenta recibe la suya, vacía).

**Las herramientas que el modelo puede usar** (y son las únicas cosas que puede ejecutar):

1. `buscar_productos` — busca en el catálogo activo por texto, ciudad y precio máximo.
2. `ver_producto` — ficha: precio, existencias, opciones (tallas/colores) y tienda.
3. `buscar_tiendas` — tiendas por nombre o ciudad, con cuántos productos activos tienen.
4. `como_se_hace` — los ocho temas de ayuda, con el texto de la app.

**Topes de gasto** (una IA sin tope es una factura sin tope): **60 mensajes por persona y día**
(ajustable con `AI_DAILY_MESSAGES`), **700 tokens** de respuesta, **4 rondas** de herramientas por
pregunta y **12 mensajes** de contexto. El gasto real (mensajes y tokens) se apunta en
`lifebook.ai_usage`.

**La clave vive solo en el `.env` del servidor** (`AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`), nunca en
el repositorio ni en la app. Sin clave, el asistente **lo dice**: «El asistente todavía no está
encendido: falta la clave del servicio de IA en el servidor» (HTTP 503), en vez de fallar de forma
rara.

## 4. Verificación: `pruebas/lb62a-verificar-asistente.cjs` → **18 PASA · 0 FALLA**

```
1. NADIE SIN SESIÓN            el estado y las preguntas exigen sesión (401)
2. EL ESTADO                   dice si está configurado, el modelo y los mensajes que quedan
3. LA CONVERSACIÓN             se lee, se empieza de cero, y OTRA CUENTA no ve la ajena
4. PREGUNTAR                   con el modelo real: responde en español, usa las herramientas,
                               enseña 1 producto REAL («Zapatillas de prueba», 25.000 XAF, Acurenam)
                               que se ABRE y tiene SU precio; apunta el gasto (quedan 58);
                               y con una barbaridad contesta «No hay nada con eso en el catálogo»
```

También se comprobó **sin clave** (14/14): el asistente dice que no está configurado en vez de
romperse, y una pregunta vacía no se traga.

## 5. Lo que queda sin verificar

* **La pantalla en el móvil**: el icono en la barra, el chat, las tarjetas y las sugerencias. El APK
  está instalado; lo prueba el dueño.
* **Coste real**: el gasto se apunta, pero no se ha medido una conversación larga de verdad.
* **La calidad de las respuestas** en preguntas difíciles (comparar productos, presupuestos): solo se
  han probado los caminos principales.

## 6. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL | `backend/sql/017_asistente_ia.sql` (aplicado) |
| Servidor | `/opt/mirror/app/src/lifebook/ai.service.ts` y `ai.controller.ts`; declarados en `http/app.module.ts` (parche 71) |
| Códigos HTTP | `http/error.filter.ts` (parche 72): 503 sin clave, 429 sin cupo, 502 si el proveedor no contesta |
| Clave | `/opt/mirror/app/.env` (`AI_API_KEY`, `AI_MODEL=deepseek-chat`, `AI_BASE_URL`, `AI_DAILY_MESSAGES`) — **fuera del repositorio** |
| App | `app/lifebook-ai.tsx` (chat) · `api/lifebookAi.ts` (cliente) · icono en `app/lifebook.tsx` |
| Prueba | `pruebas/lb62a-verificar-asistente.cjs` |
