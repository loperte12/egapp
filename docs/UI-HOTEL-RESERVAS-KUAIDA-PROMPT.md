# Prompt para 快搭 — pantalla «Mis Reservas de hotel»

> Fechado 30-sep-2026 · Kai. Fuente de verdad: `app/lifebook-hotel-reservas.tsx`,
> `packages/contracts/src/reservation-flow.ts` (etiquetas), `backend/server-src/lifebook/
> reservations.service.ts` (formato del código), `utils/datetime.ts` (formato del precio).

---

## 1 · El prompt (pegar tal cual en 快搭)

```text
Diseña una pantalla móvil de 390 px de ancho en TEMA OSCURO para la app «EG Route Plan»
(Guinea Ecuatorial). La pantalla es «Reservas de hotel»: la lista de reservas del huésped,
agrupada en tres secciones. Es una pantalla de lectura densa: tarjetas con mucho dato
ordenado, sin fotos.

PALETA (obligatoria):
- Artboard #0F0F12 · fondo de pantalla #1E1E23 · tarjetas y superficies #17171A.
- Texto principal #F2F3F5 · texto secundario #9AA0A6.
- CTA azul #0066CC · precio naranja #F08A4B · éxito verde #45B87A · peligro #C62828
  (texto de peligro suave #F58585) · bordes finos de 1 px en gris oscuro.

ESTRUCTURA (de arriba abajo) — NOMBRA CADA CAPA EXACTAMENTE con estos nombres,
en inglés y PascalCase (NUNCA «Frame 1», «Rectangle 12» ni nombres en chino):
1. «TopBar»: título «Reservas de hotel» + botón atrás ‹.
2. «SideTabs»: dos pestañas «Mis estancias» (ACTIVA, subrayado azul) y «Mi hotel».
3. «SectionHeader» ×3: «En curso (1)», «Próximas (2)», «Historial (2)».
4. «ReservationCard» (5 tarjetas, una por reserva del listado de datos). Cada tarjeta:
   - «ReservationCode»: el código en texto grande, tipo mono: LBH-260928-0013.
   - «HotelLine»: «Hotel Bahía de Malabo · Suite con vistas» (hotel · habitación).
   - «BookingStatus»: chip con borde de 1 px y fondo al 12 % del color de estado.
     Estados y colores: «Huésped dentro» (azul), «Confirmada» (azul),
     «Sin pagar (retenida)» (rojo), «Finalizada» (verde), «Cancelada» (gris),
     «Señal pagada · por confirmar» (azul).
   - «StayDates»: «30 sep → 3 oct · 3 noche(s) · 2 huésped(es)».
   - «MoneyBlock»: bloque interior con borde fino y fondo más oscuro, filas
     etiqueta-valor alineadas: Total · Señal (30 %) · Al llegar · Dinero.
   - Botones/avisos según estado (ver cada tarjeta).
5. Piezas de acción (nombres exactos):
   - «HoldCountdown»: aviso rojo «Retenida 19 min 04 s para pagar la señal
     (9 000 XAF). Si no se paga, la habitación se libera sola.»
   - «TransferRefInput»: campo «Nº de operación de tu transferencia» +
     botón azul «Enviar referencia».
   - «ConfirmDepositButton»: botón verde «Confirmar señal recibida (9 000 XAF)».
   - «RateStayButton»: botón azul «Valorar la estancia».
   - «CancelButton»: botón fantasma con borde y texto rojo «Cancelar reserva».
   - «FreeCancelNotice»: «Cancelación gratuita hasta el 2 de octubre de 2026.»
6. «EmptyState» (pieza alternativa aparte): «Todavía no has reservado ninguna
   estancia.» + enlace azul «Buscar alojamiento».

FORMATO DE PRECIOS (obligatorio): separador de miles con ESPACIO y sufijo XAF:
«15 000 XAF», «27 000 XAF», «90 000 XAF». NUNCA «15.000 XAF» ni «15000».

FORMATO DE CÓDIGOS: LBH-AAMMDD-NNNN (5 tarjetas de datos abajo).

DATOS DE PRUEBA EXACTOS:
· Tarjeta 1 (En curso) — LBH-260928-0013 · Hotel Bahía de Malabo · Suite con
  vistas · chip azul «Huésped dentro» · «30 sep → 3 oct · 3 noche(s) · 2 huésped(es)» ·
  Total 90 000 XAF · Señal (30 %) 27 000 XAF · Al llegar 63 000 XAF ·
  Dinero: «Señal cobrada · Transferencia».
· Tarjeta 2 (Próximas) — LBH-261004-0021 · Hotel Demo Malabo · Doble estándar ·
  chip azul «Confirmada» · «12 oct → 15 oct · 3 noche(s) · 2 huésped(es)» ·
  Total 45 000 XAF · «Se paga al llegar» 45 000 XAF · Dinero: «Sin cobrar ·
  En recepción» + «FreeCancelNotice».
· Tarjeta 3 (Próximas) — LBH-261005-0038 · Hotel Bahía de Malabo · Doble estándar ·
  chip rojo «Sin pagar (retenida)» · «20 oct → 22 oct · 2 noche(s) · 1 huésped(es)» ·
  Total 30 000 XAF · Señal (30 %) 9 000 XAF · Al llegar 21 000 XAF · Dinero:
  «Sin cobrar · Transferencia» + «HoldCountdown» + «TransferRefInput» +
  «CancelButton».
· Tarjeta 4 (Historial) — LBH-260901-0077 · Hotel Demo Malabo · Suite con vistas ·
  chip verde «Finalizada» · «1 sep → 4 sep · 3 noche(s) · 2 huésped(es)» ·
  Total 60 000 XAF · Dinero: «Pagado · Transferencia» + «RateStayButton».
· Tarjeta 5 (Historial) — LBH-260815-0009 · Hotel Bahía de Malabo · Habitación
  individual · chip gris «Cancelada» · «18 ago → 20 ago · 2 noche(s) · 1 huésped(es)» ·
  Total 24 000 XAF · Dinero: «Devuelto · Transferencia» + aviso «Motivo: Cancelada
  por el huésped» (sin botones).

Densidad: padding de tarjeta 12 px, gap 12 px entre tarjetas, tarjetas de ancho
completo (366 px útiles). Nada de sombras llamativas: bordes finos. La pantalla
completa debe caber mostrando al menos las tres secciones con scroll.
```

---

## 2 · Qué seleccionar en los desplegables de 快搭

Los desplegables del 新快搭 son: **技术栈 / Lenguaje**, **组件库 / Librería de componentes**,
**模板 / Plantilla**, y opcionalmente **Skill** (subir reglas del equipo).

| Desplegable | Qué elegir | Por qué |
|---|---|---|
| **Lenguaje (技术栈)** | **HTML** | Produce capas planas con los nombres del prompt intactos. React/Vue meten semántica de framework y la librería renombra capas por su cuenta. Es además el mismo formato de payload que uso yo para el canvas. |
| **Librería de componentes (组件库)** | **Ninguna / básica (no AntD, no Element Plus)** | AntD/Element imponen SUS nombres de componente y patrones de escritorio; perderías el nomenclatura `ReservationCard`/`BookingStatus`. |
| **Plantilla / Sistema de diseño** | Una plantilla **móvil oscura**; si hay opción de **subir imagen de referencia**, sube la captura de `Hotel-Listado-390` del lienzo | Hereda el estilo oscuro real del proyecto en vez de inventarlo. |
| **Skill (si aparece)** | Sube `D:\egapp\docs\design.md` (tokens del proyecto) | Es la vía más fuerte de compatibilidad: el AI recibe nuestros tokens por escrito, no como sugerencia. |

**Nota de idioma:** el prompt va en español como pediste; 快搭 entiende bien la instrucción
porque los nombres de capa y los datos van entre comillas. Si el resultado sale con capas
mal nombradas, la causa casi siempre es la **librería de componentes**, no el idioma.

**Después de generar:** «复制到 MasterGo 画布» (copiar al lienzo) y me avisas — yo verifico
por MCP que las capas llegaron con los nombres correctos y que los `var(...)` / colores
respetan el modo 暗色 antes de dar la pantalla por diseñada.
