# Plantilla de ficha de módulo

**Qué es.** El único documento que cruza del carril de **investigación** al de **construcción**. Una
ficha describe **una rebanada** (no un módulo entero), y no está lista hasta tener las **seis partes**.

**Cómo se usa.** Se copia este fichero a `docs/fichas/<módulo>-<rebanada>.md`, se rellena, y se pide
aprobación. Sin aprobación no se toca código. Al terminar, la ficha se queda como registro.

---

## Cabecera

```
Módulo:            <taxi | interurbano | comida | mercado | red-social | monedero | …>
Rebanada:          <una frase: qué se entrega>
Fecha:             <AAAA-MM-DD>
Estado:            borrador | aprobada | en vuelo | hecha | retirada
Flag:              <nombre del interruptor>
Sustituye a:       <pantalla/fichero viejo, o «nada»>
```

---

## 1 · Evidencia (de dónde sale cada cosa)

**Regla: ninguna afirmación sin fuente.** Una fila por hallazgo.

| # | Qué se observó | Fuente exacta | Tipo |
|---|---|---|---|
| 1 | p. ej. «la pestaña elige la fuente, no filtra» | `container_newface_home_main.json` (clave `businessType`) | observado |
| 2 | p. ej. «los estados son cuatro» | `strings.xml` → `fluid_sdk_follow_tab_*` | observado |
| 3 | p. ej. «el material NO trae la lista de tiendas» | búsqueda: 特别关注 = 0 apariciones | ausencia probada |

**Tipos**: `observado` (artefacto/captura) · `inferido` (deducción) · `ausente` (se buscó y no está).

**Inventario de material (obligatorio antes de la ficha):**

- [ ] ¿El material está **localizado**? (ruta exacta del APK/captura/panel)
- [ ] ¿Es el **artefacto** o sólo el **instalador**? (comprobado leyendo su estructura)
- [ ] ¿Contiene la pantalla que queremos? (búsqueda por texto **con resultado numérico**)
- [ ] ¿Contiene sus **estados** (vacío, error, sin sesión, sin permiso)?
- [ ] ¿Contiene las **medidas** (anchos, altos, colores, radios)?
- [ ] ¿Sabemos qué **NO** contiene? (la lista de huecos, escrita)

Si alguna casilla está vacía, la ficha **no pasa** a la parte 2.

---

## 2 · Alcance de AHORA (la rebanada)

- **Se entrega**: <una frase, verificable>
- **No se entrega** (aunque esté en la evidencia): <lista corta>
- **Por qué esta rebanada primero**: <desbloquea X / es la que el usuario usa>

Una rebanada = **una** cosa que se puede ver y probar. Si la frase lleva «y», son dos fichas.

---

## 3 · Costura (por dónde entra)

Marcar **una**:

- [ ] **Contrato** (backend↔app): ¿cambia el árbol, añade un tipo, cambia un atributo?
      → versión del esquema: <1 | 2>  · nuevo tipo/atributo: <cuál>
- [ ] **Kit** (widget nuevo o cambio de uno): ¿qué componente, qué tabla de claves?
- [ ] **Entrega** (despliegue/verificación): ¿qué fichero hay que empujar, qué guardia hay que añadir?

**Si no cabe en ninguna**: PARAR. Escribir un ADR (`docs/adr/`) y decidir antes.

---

## 4 · Aceptación (escrita ANTES de implementar)

- **Tests**: <qué prueba falla hoy y pasa después> — y en **qué** fichero del oráculo.
- **Móvil, estado normal**: <qué se ve, en qué pantalla> + **captura**.
- **Móvil, estado de fallo**: <qué se ve si el servidor no contesta / no hay sesión / no hay datos> + captura.
- **Guardias**: `tsc` sin errores nuevos · `diseno` verde · `logica` verde · `rutas` verde.
- **Despliegue**: <qué ficheros publica el despliegue y con qué sha>.
- **Retirada**: <qué se borra y en qué commit>.

---

## 5 · Fuera de alcance (declarado)

| Qué no se hace | Por qué | Cuándo se revisa |
|---|---|---|
| | | |

---

## 6 · Coste (para priorizar)

- **Material**: <horas de captura/investigación>
- **Traducción**: <horas de implementación en el kit/contrato>
- **Costura**: <backend> + <app>
- **Verificación**: <móvil, 2 estados> + <tests>

Si el coste de material supera al de implementación → **conseguir mejor material** antes de aprobar.

---

## Cierre (al terminar)

- [ ] Las cinco comprobaciones de la ley, una a una.
- [ ] Capturas guardadas en `docs/evidencia/<fecha>-<rebanada>.png`.
- [ ] `CONTINUAR-<módulo>.md` actualizado con lo aprendido (incluido lo que **no** funcionó).
- [ ] Ficha marcada como `hecha`.

---

## Ejemplo de una fila bien puesta (de la ficha real de 关注)

> **#1 · Qué se observó**: la barra del inicio tiene **cuatro tipos** de pestaña y el tipo decide la
> fuente del contenido (no filtra). **Fuente**: `assets/awesome/container_newface_home_main.json`, clave
> `businessType` de cada pestaña (`recommend`, `subscribe`, `campaign`, `dxContainer`). **Tipo**:
> observado.
>
> **#2 · Qué se observó**: la pestaña de seguidos distingue **cuatro estados** (sin sesión, sin novedad,
> error de red, contenido borrado) y cada uno tiene su texto. **Fuente**: `res/values/strings.xml`,
> recursos `fluid_sdk_follow_tab_*`. **Tipo**: observado.
>
> **#3 · Qué se observó**: la **página de tiendas seguidas no está** en el material. **Fuente**:
> búsqueda sobre todo el APK → 特别关注 0, 我的关注 0, 店铺关注 0; y ninguno de los 6 contenedores de
> página es esa pantalla. **Tipo**: ausencia probada.
