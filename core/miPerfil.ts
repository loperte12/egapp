/**
 * miPerfil — DÓNDE ESTÁ «MI PERFIL DE LIFE BOOK», en un solo sitio.
 *
 * ── Por qué existe este fichero tan pequeño ─────────────────────────────────
 * El acceso a lo tuyo sale en DOS sitios: la **barra superior de Life Book** (el avatar) y el
 * **menú lateral ☰** (la fila «Mi perfil de Life Book»). El estándar que este proyecto ya aplica
 * a los negocios (`ESTANDAR-ENTORNOS-DE-CONTROL.md`, implementado en `core/useMisNegocios.ts`)
 * dice, con estas palabras, por qué eso no puede resolverse por separado:
 *
 *   «Si cada pantalla lo detectara por su cuenta, en dos semanas una conocería el restaurante y
 *    la otra no.»
 *
 * Aquí pasa lo mismo con el DESTINO: si cada puerta montara su ruta a mano, el día que se cambie
 * el perfil de sitio una llevaría al nuevo y la otra al viejo, y nadie se enteraría hasta que un
 * usuario lo reportara. Una función, dos llamadas.
 *
 * ── Qué perfil es, y por qué no `/profile` ──────────────────────────────────
 * El **público** (`/lifebook-user`), no el de cuenta (`/profile`). Es lo que decidió el dueño y
 * es lo que hace 小红书: tu perfil es **el que ven los demás**, y esa pantalla ya sabe cuándo eres
 * tú — el servidor calcula `relation.isSelf` (`api/lifebook.ts:315`) y cambia sola a «Tu perfil»,
 * «Editar perfil» en vez de «Seguir», y lápiz en vez de ⋯.
 *
 * Además, medido en el código: **el perfil público es el único sitio donde se ven las
 * verificaciones** (Conductor · Tienda · Restaurante · Contratante · Anfitrión,
 * `lifebook-user.tsx:34-39`). El perfil de cuenta NO las pinta, y las tarjetas del feed tampoco.
 * O sea que el «perfil de Life Book» —el que enseña de qué está verificado alguien— sólo puede
 * ser ése.
 */
export function destinoMiPerfilLifeBook(id?: string | null) {
  // Sin id no hay perfil al que ir. Se devuelve null a propósito en vez de una ruta a medias:
  // quien lo use decide si esconde el botón o espera, pero nunca navega a un perfil vacío.
  return id ? ({ pathname: '/lifebook-user', params: { id } } as const) : null;
}
