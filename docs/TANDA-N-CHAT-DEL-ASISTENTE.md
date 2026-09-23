# Tanda N — El chat del asistente (plan aprobado por el dueño)

> Aprobado el 15/09/2026. **Nada de esto está hecho todavía.** El orden lo eligió el dueño:
> **copiar y me gusta → editar y borrar → selección múltiple y compartir → audio dictado**, y las
> **fotos con un modelo con visión** cuando esté la clave.

---

## 0. Lo que pide el dueño, tal cual

«Si el asistente escucha español, agrega poder enviar audio, poder enviar foto, poder hacer foto y
enviar, acciones modificar el mensaje, eliminar el mensaje, poder compartir los mensajes que hay
dentro del chat con más de una selección, poder dar me gusta a sus respuestas, copiar sus respuestas.»

## 1. La verdad técnica (comprobada, no supuesta)

| Función | ¿Se puede? | Cómo |
|---|---|---|
| **Copiar** una respuesta | Sí | Portapapeles del sistema (`expo-clipboard`). Solo app. |
| **Me gusta** a una respuesta | Sí | Columna `liked` en `lifebook.ai_messages` + ruta `PATCH /ai/messages/:id/like`. Solo el dueño de la conversación. |
| **Editar** un mensaje | Sí | Ruta `PATCH /ai/messages/:id` (solo los mensajes **del usuario**, no las respuestas del asistente). Al editar, el contexto del modelo usa el texto nuevo. |
| **Eliminar** un mensaje | Sí | Ruta `DELETE /ai/messages/:id`. Se borra de verdad y desaparece del contexto. |
| **Selección múltiple + compartir** | Sí | Modo selección en la app; se comparte como texto con la hoja del sistema y, si se quiere, enviándolo a un chat de la app. |
| **Audio** | Sí, **dictando** | La API de DeepSeek **no acepta audio**: se dicta en el móvil (reconocimiento de voz de Android, en español) y el asistente recibe el **texto**; el chat enseña además la burbuja de audio. |
| **Foto que el asistente VEA** | Sí, con **otro proveedor** | La API oficial de DeepSeek **rechaza imágenes** (400). Hace falta un modelo con visión (Gemini, OpenAI, Qwen-VL…). **Falta la clave.** |
| **Hacer foto y enviar** | Igual que la foto | La cámara ya está resuelta en la app (`core/pickImage`, que usan las publicaciones); falta el mismo paso del proveedor con visión. |

## 2. Decisiones de diseño (para no inventar nada raro)

* **Editar**: solo los mensajes propios. Una respuesta del asistente **no se edita** (sería falsear lo
  que dijo); si no gustó, se puede pedir otra o borrarla.
* **Borrar**: borra de verdad, y el mensaje **deja de contar** en el contexto del modelo (si no, el
  asistente seguiría «recordando» algo que el usuario quiso quitar).
* **Me gusta**: es una señal **privada** (no hay contador público en el chat); sirve para que el
  dueño vea qué respuestas funcionan.
* **Compartir**: como texto legible («Yo: … / Asistente: …») con la hoja del sistema; si se comparten
  **tarjetas de producto**, se comparte el enlace del producto, no una foto suelta.
* **Audio**: se dicta en el móvil. Si el permiso de micrófono está denegado, se dice y se ofrece
  escribir — nunca un botón muerto.
* **Foto**: hasta que haya modelo con visión, si se manda una foto el asistente **dirá que no puede
  verla** (no fingirá entenderla).

## 3. Estado del asistente hoy (tandas M y M-bis, hecho y verificado)

* Cubre **todos los servicios**: Life Book, taxi, comida, alquiler, trabajo, viajes entre ciudades,
  alojamiento, documentos y emergencia, mensajes y grupos, y la cuenta.
* **36 de 36** comprobaciones en `pruebas/lb63a-asistente-todos-los-servicios.cjs`, con datos reales.
* Arreglado en M-bis: los estados de alquileres y ofertas son **`open`** (yo filtraba `active` y por eso
  decía «no hay nada» habiendo 6 alquileres y 11 ofertas); permiso de **solo lectura** para la app en
  `food_menu_items`, `rental_properties` e `intercity_routes` (antes daba `permission denied` y el chat
  devolvía 500); un fallo de herramienta ya **no rompe** la conversación; y **busca antes de preguntar**.
* Clave de DeepSeek en `/opt/mirror/app/.env` (fuera del repositorio). Topes: 60 mensajes/persona/día,
  700 tokens por respuesta, 4 rondas de herramientas.

## 4. Lo que falta para empezar la foto

Una **clave de un proveedor con visión** (Gemini tiene capa gratuita y es la más barata para empezar).
Se pondrá en el mismo `.env` (`AI_VISION_KEY`, `AI_VISION_MODEL`, `AI_VISION_BASE_URL`) y el asistente
la usará **solo cuando llegue una foto**: el texto sigue por DeepSeek.
