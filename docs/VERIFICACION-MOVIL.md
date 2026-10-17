# Verificación en el móvil (el checklist único)

**Qué es.** La **cuarta** de las cinco comprobaciones de la ley (`LEY-DEL-PROYECTO.md` §5): lo que se
cierra es lo que se ve en el aparato **y** lo que dice el test. Hasta hoy esto estaba disperso en los
relevos y se olvidaba lo importante; aquí está en un solo sitio.

**Regla**: no se marca una ficha como `hecha` sin pasar este checklist y guardar las capturas.

---

## 0 · Antes de empezar (lo que nos ha costado horas)

- [ ] **¿La app habla con el servidor que crees?** Si es contra el local, compruébalo **con un rótulo
      distinto en local** y mirándolo en pantalla. `EXPO_PUBLIC_UI_HOST` **no** se aplica solo: si no
      entra en el bundle, la app sigue pidiendo al desplegado y **todas las pruebas de iteración son
      ciegas**. (Nos pasó: una hora.)
- [ ] **`adb reverse` está puesto** (`tcp:8081`, y `tcp:8788` si aplica). Se **pierde en cada
      reconexión** del teléfono.
- [ ] **Metro está sirviendo** el bundle: si el `TypeError: fetch failed`, arrancar con
      `npx expo start --port 8081 --offline` y `CI=1 EXPO_OFFLINE=1`.
- [ ] **Espacio libre en C:** (mínimo ~2 GB). Se quedó a 0 y tumbó hasta un commit.
- [ ] **Sesión válida**: si los botones se quedan en «Comprobando…» eternamente, sospecha de la sesión
      (token caducado), no del endpoint.

## 1 · Estado normal (lo que se ve)

- [ ] Abrir la pantalla desde la navegación real (**no** sólo por deep link).
- [ ] Comprobar **el orden y la jerarquía** de lo que sale, no sólo que salga.
- [ ] Comprobar los **textos** (microcopy) y que no falten rótulos.
- [ ] Comprobar **una interacción** de verdad (un toque que hace algo: navegar, seguir, refrescar).
- [ ] **Captura** → `docs/evidencia/<fecha>-<rebanada>.png`.

## 2 · Estado de fallo (lo que casi nadie prueba)

Una pantalla no está hecha hasta que se ve qué pasa **cuando algo falta**:

- [ ] **Sin red** (modo avión): ¿sale el estado de error con su «Reintentar», o una caja vacía?
- [ ] **Sin datos** (usuario nuevo): ¿sale el estado vacío con su texto y su acción?
- [ ] **Sin sesión**: ¿sale el login/invitado, o un 401 crudo?
- [ ] **Dato que falta** (una portada que no carga): ¿se ve el marcador, ocupa su sitio, se pliega?
- [ ] **Captura** del estado de fallo (sí, también).

## 3 · Lo que no se ve pero decide

- [ ] **Ningún aviso de React Native** nuevo (anidado de listas, claves, texto fuera de `<Text>`).
      Mirar el log de Metro, no la pantalla.
- [ ] **El servidor** contesta lo que crees: pedir la ruta con el token y leer el JSON
      (`pruebas/probar-seccion-seguidos.mjs` es el patrón: token firmado + la ruta).
- [ ] **Producción** = **git**: el despliegue imprime «CONCUERDA ✓» o, si no, se repite `--comprobar`
      a los 30 s.

## 4 · Cierre

- [ ] Las capturas, en la carpeta de evidencia, con nombre `<fecha>-<rebanada>.png`.
- [ ] El estado (normal y fallo) escrito en el relevo del módulo: una línea cada uno.
- [ ] Si algo se quedó sin probar, **se escribe**: «sin probar: X» es información; «probado» sin prueba,
      no.

---

## Plantilla de copia para el relevo

```
Verificación en móvil (<fecha>)
  pantalla:        <nombre>
  servidor:        <producción | local (comprobado con rótulo)>
  sesión:          <válida | caducada | invitado>
  normal:          ✓ <qué se vio>            [captura]
  fallo (sin red): ✓ <qué se vio>            [captura]
  fallo (vacío):   ✓ / n/a
  avisos RN:       <0 | cuáles>
  pendiente:       <nada | qué>
```
