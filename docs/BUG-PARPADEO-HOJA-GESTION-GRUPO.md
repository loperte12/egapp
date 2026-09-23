# Bug: la hoja «Gestión del grupo» parpadeaba y no aceptaba toques

> Estado: **arreglado y medido**. Fecha: 14/09/2026.
> Lo dijo el dueño así: *«la barra de gestión del grupo tiene bug no es estable se
> parpadea»*. Tenía razón, y el daño era mayor de lo que parecía: además de parpadear,
> **la hoja no aceptaba pulsaciones** en todo su contenido.

## 1. Lo que se medía (no «a ojo»)

Los toques no entraban: tocando la fila «Código de ruta y QR» o «Solicitudes para entrar»
**no pasaba nada**, y arrastrando el dedo la lista **tampoco se movía**. Lo único que
respondía era **«Cerrar»**.

Antes de tocar código se midió con las estadísticas de fotogramas de Android
(`dumpsys gfxinfo`), con la hoja abierta y **sin tocar nada durante 6 segundos**:

| Hoja abierta, 6 s sin tocar | Fotogramas pintados |
|---|---|
| **Gestión del grupo** | **52 · 53 · 25** (una y otra vez) |
| Ficha del grupo (otra hoja, para comparar) | **0** |
| Chat, hoja cerrada | **0** |

Una app quieta pinta **0**. Aquella hoja estaba repintándose sola entre 4 y 9 veces por
segundo: eso es el parpadeo que se veía. Y explica los toques perdidos — el contenido se
estaba desmontando y volviendo a montar sin parar, así que el dedo caía en una fila que
acababa de desaparecer (la cabecera, con «Cerrar», no se remonta: por eso solo esa
funcionaba).

## 2. La causa

```tsx
// app/lifebook-chat/[id].tsx
<GroupManageSheet
  onClose={() => setMembersOpen(false)}   // ← función NUEVA en cada render del padre
  ...
/>
```

```tsx
// components/lifebook/GroupManageSheet.tsx  (antes)
const load = useCallback(async () => { … onClose(); }, [groupId, onClose]); // ← depende de onClose

useEffect(() => {
  if (!visible) return;
  setStep(initialStep); setPicked([]); setQuery(''); setDetailMember(null);
  setGroup(null);                                   // ← se vacía el grupo…
  setRequests(null); setPendingCount(0);
  load();                                           // ← …y se vuelve a pedir
}, [visible, initialStep, load]);                   // ← …cada vez que `load` cambia
```

Cadena completa: el padre pasa un `onClose` nuevo → `load` cambia de identidad → el efecto
se vuelve a ejecutar → **`setGroup(null)`** (la hoja se queda sin contenido) → `load()`
pide el grupo otra vez → `setGroup(g)` (vuelve el contenido) → y así en bucle mientras el
padre se re-renderice.

No es un fallo de React Native ni del `Modal`: es un efecto que depende de algo que el
padre no puede mantener estable.

## 3. El arreglo

`components/lifebook/GroupManageSheet.tsx`:

```tsx
const onCloseRef = useRef(onClose);
useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

const load = useCallback(async () => { … onCloseRef.current(); }, [groupId]);  // ya no depende de onClose
```

`load` pasa a ser **estable** y el efecto deja de re-ejecutarse. Se arregla **en la hoja**,
no en el padre: así queda protegida aunque cualquier pantalla futura le pase funciones
nuevas en cada render (que es lo normal en React).

## 4. Cómo se comprobó

| Comprobación (en el Poco F5, APK instalada) | Antes | Después |
|---|---|---|
| Fotogramas en 6 s con la hoja abierta y quieta | 25–53 | **0 · 0** |
| Tocar «Código de ruta y QR» | no hacía nada | abre la pantalla del código |
| Arrastrar la lista de la hoja | no se movía | se mueve |
| Tocar «Solicitudes para entrar» | no hacía nada | abre las solicitudes |

## 5. Trampa de método (para el próximo que mida esto)

El mismo toque en la cabecera del chat abre **dos hojas distintas** según caiga en el
título o en el subtítulo: «Opciones del chat» (título) o «Gestión del grupo» (subtítulo).
Una medición anterior dio 106 y 150 fotogramas y **no era de esta hoja**: era de la otra.
Antes de dar por bueno un número hay que **comprobar en el volcado de pantalla qué hoja
está abierta**. En este documento todos los números son de «Gestión del grupo», con
«eres el dueño» visible en el volcado.

## 6. El mismo patrón, buscado en el resto del código

Se buscaron los efectos que dependen de un `onClose` que llega por propiedades. Solo
aparece otro caso, `components/status/StatusDetailModal.tsx:80`
(`}, [remainingMs, expiresMs, visible, onClose])`), y **no es un bug**: ese efecto solo
programa un `setTimeout` de 400 ms cuando el estado 24 h ya ha terminado, y un `ref`
(`endedRef`) impide que se repita. Se deja como está.
