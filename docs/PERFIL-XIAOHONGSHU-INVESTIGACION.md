# Cómo diseña 小红书 el perfil: cuenta personal vs. cuenta comercial

**Parte 51-f · 13 de septiembre de 2026**

> Lo pedido: *«conviene indagar cómo 小红书 diseña su perfil, ya sea para una cuenta normal o una
> cuenta de tiendas comerciales; en nuestro caso tenemos agregado muchas variantes de negocio.
> Pasar de una cuenta social a una cuenta normal tiene muchas diferencias y pasos diferentes;
> conviene indagar y **nunca suponer nada**, ningún paso debe ser suposición.»*
>
> Este documento es la investigación. **Nada de aquí sale de lo que yo crea recordar**: lo que no
> he podido confirmar con una fuente está en §6, separado y marcado, y no se usa para decidir.

---

## 1. Fuentes, y qué fiabilidad tiene cada una

| Fuente | Qué es | Fiabilidad |
|---|---|---|
| [天擎天拓 · «了解小红书的三种账户类型»](https://www.topsky.com/product/xiaohongshu/673) | Agencia de marketing de 小红书. Compara los tres tipos de cuenta función por función | **Alta para el DISEÑO de la portada** (es su oficio describirlo al detalle). Es material comercial, no oficial del producto |
| [美迪电商 · «如何开通小红书店铺？3步快速入驻»](https://www.gzjsj.com/article/11181.html) | Academia de e-commerce. Los pasos y requisitos de abrir tienda | **Media-alta para los PASOS.** Los importes y plazos cambian con el tiempo |
| [知乎 · «小红书企业号与个人号的四大不同»](https://zhuanlan.zhihu.com/p/6561900750) | Artículo de operadores | **No se pudo leer** (403). Solo se usa como pista de que existe la distinción |

**Aviso honesto:** ninguna de las dos es el centro de ayuda oficial de 小红书. Sirven para entender
**cómo está diseñado y qué pasos hay**, que es lo que se preguntaba; **no** para copiar cifras
(importes de fianza, plazos) como si fueran contrato. Las cifras concretas van en §6.

---

## 2. Los tres tipos de cuenta, y qué cambia EN LA PORTADA

Esto es lo que responde de verdad tu pregunta, porque es una comparación de **lo que se puede poner
en el perfil**:

| | **Personal** (个人号) | **Profesional certificada** (认证专业号) | **Empresa** (企业号) |
|---|---|---|---|
| Cómo se obtiene | Solo el teléfono, sin documentos | Documentos de identidad + prueba de actividad profesional (p. ej. licencia de negocio o enlaces a redes) | Registro de la empresa, registro de marca, presentación de marca y plan de negocio |
| Insignia | **Ninguna** | **Dorada** + etiqueta de sector («experto en maquillaje», «bloguero de moda») | **Azul** + sufijo de nombre personalizable («XX官方») |
| Portada: qué deja poner | **Solo avatar, nombre y bio.** NO admite fijar publicaciones, ni contacto oficial, ni portada de marca, ni colores, ni categorías propias, **ni enlazar a una tienda** (dentro o física), ni widgets | Avatar y portada de marca, **categorías propias en la portada** (p. ej. sección de productos o de servicios), **fijar hasta 3 publicaciones**, descripción larga, insignia | Todo lo anterior **+ integración con la tienda**, botón de contacto, **datos de la tienda física**, enlaces web incrustados, widgets de regalo, páginas de marca por tema, y sección **«Historia de la marca»** |
| Vigencia | — | **Se re-verifica cada año**; se revoca si el contenido deja de coincidir con el sector declarado | La plataforma revisa la actividad periódicamente; se revoca si la cuenta queda inactiva o incumple |
| Revisión | inmediata | — | **7-10 días laborables** (más si el sector está regulado) |

**La frase que importa para nosotros:** *la cuenta personal **no puede enlazar a una tienda***. En
小红书, tener tienda **no es una opción del perfil: es un tipo de cuenta distinto**. Y lo que cambia
al subir de tipo es, literalmente, **qué bloques puede mostrar la portada**.

---

## 3. Los pasos entre tipos (lo que tú avisabas que «son pasos diferentes»)

Tenías razón: no es un interruptor. Según las fuentes, el recorrido es:

1. **Personal → Profesional certificada.** Hay que *solicitar la subida* y aportar identidad +
   prueba de actividad. Al aprobarse entra la insignia dorada. **Se re-verifica cada año** y se
   puede **perder** si el contenido se desvía del sector.
2. **→ Empresa.** Documentos mercantiles (registro de la sociedad, marca), presentación y plan de
   negocio. **7-10 días laborables** de revisión. Insignia azul y sufijo de nombre.
3. **Tienda.** Es un trámite **aparte** del tipo de cuenta (§4).

**Lo que esto enseña de diseño:** en 小红书 el perfil **no se vuelve comercial solo**: alguien revisa,
concede, y **puede retirarlo**. Hay un estado (`certificada`) con fecha de caducidad.

---

## 4. Abrir tienda: dónde está la puerta, y los 3 pasos

Esto es lo más útil para nuestra decisión, porque **la puerta está dentro del perfil**:

> **我的** (tu perfil) **→ ☰ (las tres rayas de arriba a la izquierda) → 创作中心 → 开通店铺**

Y después:

| Paso | Qué se hace | Detalle |
|---|---|---|
| 1 | Elegir tipo de tienda | **个人店** (sin licencia: solo DNI y cuenta verificada) · **个体店** (licencia + DNI del titular) · **企业店** (licencia + DNI del representante legal) |
| 2 | Rellenar y subir | Nombre de la tienda, **categoría de negocio** (una vez elegida **no se cambia libremente**), DNI por ambas caras y una foto sosteniéndolo |
| 3 | Revisión y apertura | Revisión inicial en **1-3 días laborables**, fianza, firma del acuerdo y cuenta de liquidación → se desbloquea publicar productos |

**Y esto confirma que el diseño que ya tenemos es el correcto:** en 小红书 la puerta al entorno
comercial vive en **el perfil + el menú ☰**, que es exactamente el patrón que este proyecto ya
escribió en `core/useMisNegocios.ts` («sale en DOS sitios: el bloque del perfil y el menú lateral
☰… si cada pantalla lo detectara por su cuenta, en dos semanas una conocería el restaurante y la
otra no»). No hay que inventar nada: hay que **seguir la misma regla para el perfil de Life Book**.

---

## 5. Qué significa para NUESTRA app (aquí está la diferencia de verdad)

Tenemos un modelo **distinto** al de 小红书, y conviene decirlo claro porque decide el diseño:

| | 小红书 | Nosotros (comprobado en el código) |
|---|---|---|
| Cómo se distingue una cuenta normal de una comercial | **Un TIPO de cuenta**: personal / profesional / empresa. Uno por cuenta | **Verificaciones por VERTICAL, acumulables en la MISMA cuenta**: `LbProfile.verified = { driver, food, seller, work, rental }` (`api/lifebook.ts:314`) |
| Cuántos negocios puede tener una cuenta | Normalmente uno, con su tipo | **Varios, de verticales distintos.** `useMisNegocios` devuelve una **lista** (hotel, restaurante, mercado, trabajo) y el propio código dice: «medido: la cuenta de pruebas tiene un hotel, un restaurante y es repartidor» |
| Qué es «subir de tipo» | Un trámite revisado, con caducidad anual | Ya existe, pero **por vertical**: cada `verified.*` es independiente |
| Dónde vive la gestión | Perfil + ☰ → 创作中心 | **Ya igual**: bloque «TUS NEGOCIOS» del perfil + ☰, con `useMisNegocios` como única fuente |

**Conclusión: no hay que copiar el modelo de tipos de cuenta de 小红书** — nosotros ya resolvimos lo
mismo con verificaciones por vertical, y encima mejor para nuestro caso, porque una cuenta puede ser
hotel **y** repartidor a la vez, cosa que allí no cabe en un solo tipo.

Lo que **sí** hay que copiar es la **lección de la portada**: en 小红书 lo que cambia entre una
cuenta normal y una comercial es **qué bloques enseña el perfil**, no que sea otra pantalla. Nuestro
`profile.tsx` ya lo hace así: si la cuenta no tiene negocios, el bloque «TUS NEGOCIOS» simplemente
**no aparece** (y el ☰ sigue funcionando) — está escrito en `ServicesDrawer.tsx:57`.

---

## 6. Lo que NO se ha podido confirmar (y por tanto NO se asume)

Nada de esto se usa en la decisión:

- **Importes de fianza** de la tienda (la fuente dice ~1000 元 para 个人店, con opción de abrir a 0 y
  pagar después). **No se copia**: son cifras comerciales de un tercero, cambian y no son nuestro
  caso (nosotros no cobramos fianza por publicar).
- **Plazos exactos** de revisión (1-3 días tienda, 7-10 días empresa). Son de la fuente, no oficiales.
- **La página oficial de 小红书 no se ha podido leer** (los artículos de Zhihu devuelven 403, y el
  centro de ayuda oficial no sirve texto sin JavaScript). Si hace falta el dato oficial, hay que
  mirarlo con la app delante o desde la cuenta real.
- **No se ha verificado en la app real de 小红书** el aspecto exacto de la portada de una tienda. Lo
  que hay en §2 es lo que **permite** cada tipo según la fuente, no una captura.

---

## 7. Recomendación

### 7.1 Lo que ya está decidido

- **Qué abre el perfil de Life Book:** el **perfil público**, `/lifebook-user` con tu id — lo que ves
  es lo que ven los demás. El perfil de cuenta (`/profile`, con identidad y «TUS NEGOCIOS») se queda
  como está.
- **Dónde van las puertas:** **avatar en la barra superior de Life Book** (el hueco que hoy no
  existe: esa barra solo tiene Volver, ciudad, Buscar y Mensajes) **+ fila en el ☰**, aplicando la
  regla de las dos puertas con una sola fuente de verdad. Y esto último **no es una opinión mía: es
  exactamente donde 小红书 pone su 创作中心** (§4).

### 7.2 Lo que falta decidir, y que no voy a suponer

1. **Si la cuenta no tiene ningún negocio**, ¿el perfil público debe mostrar algo distinto? En
   小红书 la cuenta personal simplemente **tiene menos bloques** (nada de tienda, nada de contacto
   oficial, nada de fijar publicaciones). Nuestro `profile.tsx` ya esconde «TUS NEGOCIOS», pero
   **no** oculta nada más.
2. **¿Queremos poder fijar publicaciones** (小红书 deja 3 en cuentas profesionales)? Hoy no existe.
3. **¿Verificación visible en el perfil público?** **Comprobado: ya se pinta, y bien.** No era una
   suposición pendiente, ya está hecho: `lifebook-user.tsx:34-39` tiene las cinco chapas
   (`driver` Conductor · `seller` Tienda · `food` Restaurante · `work` Contratante · `rental`
   Anfitrión), una insignia `BadgeCheck` junto al nombre, y un botón a la tienda cuando
   `verified.seller`. **El perfil de cuenta (`profile.tsx`) NO las pinta**, ni tampoco las tarjetas
   del feed. Es decir: hoy **el perfil público es el único sitio donde se ve de qué está verificado
   alguien** — otra razón para que el perfil de Life Book sea ése.

   Y **ya sabe cuándo eres tú**: `profile.relation = { isSelf, isFollowing, isFollower }` **lo calcula
   el servidor** (`api/lifebook.ts:315`), y la pantalla cambia sola: «Tu perfil» en vez de «Miembro
   de Life Book», **«Editar perfil»** en vez de «Seguir», lápiz en vez de ⋯. Abrir
   `/lifebook-user?id=<tu id>` **ya es** «tu perfil», sin construir nada nuevo.
4. **La cuenta de tienda como algo aparte**: en 小红书 una tienda es un trámite con revisión y
   categoría **no modificable**. Nuestro `lifebook-sell` deja publicar directamente. ¿Se quiere
   añadir un paso de revisión, o se queda la publicación directa? **Es una decisión de producto, no
   técnica**, y cambia bastante el trabajo.

---

## 8. Lo implementado (13-sep-2026): las dos puertas

### 8.1 El hallazgo: la segunda puerta ya existía, y no hacía nada

Antes de escribir nada se buscó si ya había algo, y **sí lo había**:

```ts
// components/ServicesDrawer.tsx (antes)
{ icon: requireIcon('UserRound'), label: 'Mi perfil', action: onClose },
```

**«Mi perfil» estaba en el ☰, pero su acción era `onClose`: cerraba el menú y no iba a ninguna
parte.** No estaba rota de forma visible — simplemente no hacía nada, que es exactamente lo que el
dueño describía como *«el segundo perfil no está activo»*. Y tenía razón.

Eso cambia el trabajo: no había que **inventar** una puerta nueva, había que **terminar** la que
estaba a medias.

### 8.2 Lo que se hizo

| Fichero | Qué |
|---|---|
| **`core/miPerfil.ts`** (nuevo) | `destinoMiPerfilLifeBook(id)` — **la única** definición de a dónde lleva «mi perfil». Existe para que las dos puertas no puedan separarse, que es la regla que el proyecto ya aplica a los negocios en `useMisNegocios` |
| `app/lifebook.tsx` | **Avatar en la barra superior**, a la derecha de Mensajes. Sale de la **misma llamada a `authApi.me()` que ya se hacía para la ciudad** (antes se tiraban el id y el avatar): cero peticiones nuevas. Se pinta **siempre**, con la inicial si no hay foto, para que la puerta no dependa de que la red conteste |
| `components/ServicesDrawer.tsx` | «Mi perfil» → **«Mi perfil de Life Book»**, y ahora **navega** al perfil público. Se añadió «de Life Book» a propósito: la pestaña «Perfil» del dock lleva al perfil de **cuenta** (`/profile`, identidad + negocios) y dos cosas distintas no pueden llamarse igual |

**Destino: el perfil PÚBLICO** (`/lifebook-user?id=<tu id>`), no `/profile`. Decidido por el dueño y
coherente con 小红书: tu perfil es el que ven los demás, y esa pantalla ya sabe que eres tú
(`relation.isSelf` del servidor) y cambia sola a «Tu perfil» + «Editar perfil».

### 8.3 Lo que NO se hizo, para no suponer

- **No se tocó `profile.tsx`** (el perfil de cuenta): el bloque «TUS NEGOCIOS» sigue igual.
- **No se añadió ninguna pestaña al dock**: tiene 5 fijas y `Perfil` ya existe. Una sexta rompería
  la convención y duplicaría.
- **No se inventó pantalla nueva**: el perfil público ya hacía todo lo que hace falta.
- **No se tocó `components/FloatingFooter.tsx`**, que estaba excluido.

### 8.4 Estado

`npx tsc --noEmit` limpio. **APK compilado (110,6 MB, 20:58:21) pero NO instalado**: el móvil estaba
desconectado del USB (`adb: no devices/emulators found`). **La navegación no está verificada en el
aparato** — queda pendiente instalarlo y comprobar las dos puertas con el dedo.

---

## 9. El estado 24 h: era un diario privado (13-sep-2026)

### 9.1 El fallo

Lo dijo el dueño entre bromas y era literal: *«un estado publicado en el perfil de la cuenta los
seguidores no lo verán jajajaja»*. Comprobado, es exactamente eso.

El estado 24 h se pintaba **sólo con `myStatus`**, en cuatro sitios, **todos del dueño**:

| Sitio | ¿De quién? |
|---|---|
| `profile.tsx` (perfil de cuenta) | `myStatus` |
| `status.tsx` (`/status`) | `myStatus` |
| `edit-profile.tsx` | `myStatus` |
| `SocialHomeHeader.tsx` | `myStatus` |
| **`lifebook-user.tsx` (perfil público)** | **nada** — no importaba ni un componente de estado |

O sea: editor, anillo, píldora, modal tipo historia, niveles de visibilidad (`public`/`followers`/
`private`) y hasta endpoint para **reportar** un estado… **y ni un solo sitio donde otra persona lo
viera.** Un diario con candado y sin lector.

### 9.2 Estaba todo hecho menos el último cable

- Servidor: `src/mobility/status.controller.ts:6` → `GET /v1/mobility/status/users/:userId → estado visible de un usuario`
- Cliente: `api/status.ts:115` → `statusApi.userStatus(userId)`
- **Nadie lo llamaba.** Buscado en toda la app: sólo aparecían las *importaciones del tipo*
  `UserStatus`, nunca la función.

Así que el arreglo es **de app, no de servidor**.

### 9.3 Lo que se hizo (en `app/lifebook-user.tsx`)

- El avatar pasa a ser **`StatusRingAvatar`** (trae el anillo y, si no hay foto, la inicial: era
  justo lo que el bloque hacía a mano). 80 + 3 de anillo = 86, el mismo tamaño que había.
- Dos fuentes a propósito: **si el perfil es el tuyo**, el store (`myStatus`, que se refresca solo
  al publicar o finalizar); **si es el de otra persona**, `statusApi.userStatus()` — que ya respeta
  la visibilidad en el servidor.
- El toque abre el **`StatusDetailModal`**, con `isMine={rel.isSelf}` **explícito**.

### 9.4 La trampa que había en el modal

Dentro de `StatusDetailModal` está `const mine = isMine ?? !author;`. Es decir: **si no se le dice
nada, asume que el estado es tuyo** y ofrece «finalizar». En el perfil de otra persona eso habría
sido darle a un visitante **el botón de terminar el estado ajeno**. Por eso se pasa `isMine` y el
`author` del perfil, en vez de dejarlo al aire.

### 9.5 Verificado en el aparato

Con un estado publicado por **otra cuenta** (BERNARDO LOPERTE) y la app abierta con una cuenta
distinta:

- En su perfil: **«Siguiendo»** (vista de visitante, no «Editar perfil»).
- El anillo está y se anuncia: **«Avatar de BERNARDO LOPERTE con estado: 😊 Estado del OTRO
  usuario»**.
- Al tocar: se abre el detalle con **«quedan 23 h»**, el emoji, el texto, **Compartir · Reportar ·
  Cerrar** — y **NO aparece «Finalizar»**. La protección funcionó.

### 9.6 Un susto que NO era

Mi primer intento de publicar un estado por API devolvió
`400 property clientId should not exist`. Parecía que **la app tampoco podía publicar** (manda
`clientId` en el `publish`). **No es así**: `api/status.ts:103` lo **saca del cuerpo** y lo manda
como cabecera `X-Client-Request-Id` (idempotencia por cabecera). El error era de mi script de
prueba. Queda anotado porque es el tipo de cosa que se reporta como bug y no lo es.

### 9.7 Lo que sigue abierto de este punto

- **Un chip de estado en las tarjetas del feed.** Hoy el estado se ve en el perfil, no en el feed
  ni en la lista de seguidores. 小红书 lo pinta en el avatar de la nota.
- **`edit-profile.tsx` y `status.tsx` siguen siendo sólo del dueño** — correcto, pero conviene
  revisar que su copia («Agregar estado 24h») no invite a publicar sin decir quién lo verá.


