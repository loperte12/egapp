# Ficha · Mercado · Retirar la pantalla vieja de tiendas seguidas

```
Módulo:            mercado
Rebanada:          retirar `ecomerse-perfil-tiendas` y dejar su acceso en la pestaña 关注
Fecha:             2026-10-17
Estado:            en vuelo — código hecho y guardias verdes; **falta la comprobación en el móvil** (sin dispositivo USB)
Flag:              no hace falta (no hay dos versiones a la vez: se retira y se sustituye en el mismo commit)
Sustituye a:       app/ecomerse-perfil-tiendas.tsx (213 líneas)
```

## 1 · Evidencia

| # | Qué se observó | Fuente exacta | Tipo |
|---|---|---|---|
| 1 | La pantalla vieja existe y es la única lista de tiendas seguidas | `app/ecomerse-perfil-tiendas.tsx` (213 líneas) | observado |
| 2 | Se llega a ella **sólo** desde el perfil | `app/ecomerse-perfil.tsx:251` (`ruta: '/ecomerse-perfil-tiendas'`) + `constants/rutas.ts:67` | observado |
| 3 | Su sustituto ya está desplegado y con datos reales | pestaña 关注 del Mercado: `/api/ecomerse/ui/siguiendo` → `200` con `tarjetas` y 11 plantillas; móvil verificado (evidencia `171025-siguiendo-con-datos-reales.png`) | observado |
| 4 | El feed del Mercado **sí** acepta un parámetro de arranque de forma idiomática | precedente: `ecomerse-orders?filtro=`, `ecomerse-mensajes-avisos?canal=` (`useLocalSearchParams`) | observado |
| 5 | La pantalla vieja **no** es basura: lista con `CabeceraTienda`, dejar de seguir, vacío y error | lectura del fichero | observado |

**Inventario de material**: no aplica (no se copia nada de Taobao en esta rebanada; es **retirada**).
Lo que se retira está **sustituido por código ya desplegado** (punto 3).

## 2 · Alcance de AHORA

- **Se entrega**: `ecomerse-perfil-tiendas` **deja de existir**, y el acceso del perfil («Tiendas que
  sigo») abre el **Mercado en la pestaña 关注** (con `?feed=siguiendo`), que es la sección que la
  sustituye. Un solo commit: la pantalla se borra **y** el acceso apunta al sustituto.
- **No se entrega**: la paridad completa con la página de tiendas de Taobao (pestañas 全部/上新/分类,
  secciones 买过/特别关注/常逛). Eso es **otra ficha** y está bloqueada por material
  (`ESQUEMA-关注-TAOBAO.md` §3): hace falta captura.

## 3 · Costura

- [ ] Contrato — **no**: ningún árbol ni tipo cambia.
- [x] **Kit** — no se toca ningún widget; se retira una pantalla que usaba `CabeceraTienda`.
- [x] **Entrega** — la ruta desaparece del mapa (`constants/rutas.ts`) y `npm run rutas` tiene que
      seguir verde; el enlace del perfil pasa a llevar **parámetro**.

## 4 · Aceptación (escrita antes)

- **Tests/guardias**: `npm run verificar` en verde, con **`rutas`** verde (el mapa ya no declara la
  pantalla y no queda ninguna ruta sin fichero), `tsc` en la línea base, oráculo igual.
- **Móvil, estado normal**: Perfil → «Tiendas que sigo» → abre el Mercado **con 关注 encendido**
  (carril naranja en «Siguiendo»), y las tarjetas de las tiendas seguidas se ven. Captura.
- **Móvil, estado de fallo**: sin red, esa pestaña muestra su error con «Reintentar» (ya cubierto por
  la sección; se comprueba que no aparece una pantalla en blanco).
- **Retirada**: `app/ecomerse-perfil-tiendas.tsx` **borrado**; `ecomersePerfilTiendas` fuera de
  `constants/rutas.ts`; ninguna referencia en `app/`, `components/` ni `api/`.

## 5 · Fuera de alcance

| Qué no se hace | Por qué | Cuándo se revisa |
|---|---|---|
| La página de tiendas con pestañas (Taobao B) | no hay material (la genera el servidor) | cuando haya captura |
| Quitar el contador «N tiendas» del perfil | sigue siendo útil y no depende de la pantalla vieja | — |

## 6 · Verificación (17/10/2026)

| comprobación | resultado |
|---|---|
| `npm run verificar` | ✅ en verde (tsc 5 = base · diseño · lógica · **rutas 137, mapa al día** · oráculo 155/155) |
| Fichero retirado | ✅ `app/ecomerse-perfil-tiendas.tsx` borrado |
| Ruta retirada | ✅ `ecomersePerfilTiendas` fuera de `constants/rutas.ts` |
| Referencias | ✅ sólo quedan dos **comentarios** que explican la retirada (en el perfil y en el feed) |
| Móvil: Perfil → «Tiendas que sigo» abre el Mercado en 关注 | ⏳ **PENDIENTE**: el teléfono no aparecía por USB (`adb devices` vacío) al cerrar la rebana. **No se afirma probado.** |
| Móvil: estado de fallo (sin red) | ⏳ pendiente de la misma pasada |

**Para cerrarla** (cuando haya dispositivo): `adb reverse tcp:8081 tcp:8081` → abrir Perfil →
«Tiendas que sigo» → comprobar que el carril **Siguiendo** queda encendido y las tarjetas se ven →
captura en `docs/evidencia/`. Si sale bien, esta ficha pasa a `hecha`.

## 7 · Coste

- **Material**: 0 (retirada).
- **Traducción**: ~30 líneas (un parámetro en el feed, un enlace).
- **Costura**: cliente sólo; backend sin cambios.
- **Verificación**: `npm run verificar` + móvil (2 estados) + captura.
