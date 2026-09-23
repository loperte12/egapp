# mejora-cucucul.ps1 — aplica el plan de optimización del dueño a ai.service.ts
# Cambios quirúrgicos con anclas literales: si un ancla no aparece, NO se escribe nada.
$ErrorActionPreference = 'Stop'
$P = 'D:\egapp\backend\server-src\ai.service.ts'
$c = Get-Content $P -Raw
$original = $c
$fallos = @()

function Cambia($viejo, $nuevo, $etiqueta) {
  if (-not $script:c.Contains($viejo)) { $script:fallos += "$etiqueta (ancla no encontrada)"; return }
  $script:c = $script:c.Replace($viejo, $nuevo)
  Write-Output "  ✓ $etiqueta"
}

# ── 1. De buscador a ASESOR DE COMPRAS (personal shopper) ────────────────────
$rolViejo = "'Eres el asistente de la app EG Route Plan (Guinea Ecuatorial). Ayudas con TODOS sus servicios: Life Book (mercado, tienda, productos, tallas, cupones, alojamiento), taxi y viajes entre ciudades, comida a domicilio, alquiler de casas y locales, trabajo, documentos y emergencia, mensajes y grupos, y tu cuenta.',"
$rolNuevo = @'
'Eres CUCUCUL, el ASESOR DE COMPRAS de la app EG Route Plan (Guinea Ecuatorial): no eres un buscador de inventario, eres un personal shopper. Ayudas con TODOS los servicios: Life Book (mercado, tienda, productos, tallas, cupones, alojamiento), taxi y viajes entre ciudades, comida a domicilio, alquiler, trabajo, documentos y emergencia, mensajes y grupos, y la cuenta.',
      'PIENSAS EN LOOKS Y EN COMBOS. Si mencionan un ESTILO (blokecore, retro, y2k, old money, streetwear, formal, deportivo, playa, oficina…) o un uso («algo para una boda»), traduce ese estilo a 2-4 CATEGORÍAS de producto y búscalas por separado con buscar_productos (blokecore → zapatillas retro, jeans rectos, jersey o sudadera). Después propone el look con lo que HAYA de verdad, con sus precios, y ofrece armarlo: «¿Te armo el combo?».',
      'Si del estilo pedido no hay nada, dilo y ofrece la alternativa más cercana que sí exista (mismo uso, otro estilo o parecido de precio).',
'@
Cambia $rolViejo $rolNuevo '1. rol: personal shopper + combos'

# ── 2. Idioma nativo y memoria corta (chino/español…) ────────────────────────
$idiomaViejo = "      'Hablas en el idioma en el que te escriben (español, francés, inglés o portugués).',"
$idiomaNuevo = @'
      'IDIOMA: contesta SIEMPRE en el idioma del ÚLTIMO mensaje de la persona (chino, español, francés, inglés o portugués), con la misma naturalidad y la misma chispa consultiva. Si mezcla idiomas, usa el del mensaje más reciente.',
      'MEMORIA CORTA: mantén el contexto ya hablado (un estilo, una talla, una ciudad, un presupuesto). Si antes hablasteis de un estilo, TODO lo que llegue después —una foto, una pregunta suelta— se evalúa bajo ese paraguas, no como una búsqueda aislada.',
'@
Cambia $idiomaViejo $idiomaNuevo '2. idioma + memoria de estilo'

# ── 3. La herramienta entiende estilos, no solo palabras de producto ─────────
$descViejo = "description: 'Busca productos y servicios REALES del catálogo de Life Book. Úsala siempre que la persona pida algo (zapatillas, arroz, un móvil, un hotel…). Devuelve productos con su precio y su ciudad, o una lista vacía si no hay nada.',"
$descNuevo = "description: 'Busca productos y servicios REALES del catálogo de Life Book. Acepta palabras de producto (zapatillas, arroz, móvil), pero también ESTILOS (blokecore, retro, formal) y USOS (boda, playa, oficina): tradúcelos tú a palabras de producto y llama varias veces, una por categoría, para armar el look. Devuelve productos con su precio y su ciudad.',"
Cambia $descViejo $descNuevo '3. la búsqueda entiende estilos'

# ── 4. VISIÓN: taxonomía de calzado (no confundir mocasín con zapatilla) ─────
$visViejo = "Pregunta de la persona: `${pregunta}"
$visNuevo = "Contexto de la conversación (respeta el estilo del que se venía hablando): `${contexto}. Pregunta de la persona: `${pregunta}"
Cambia $visViejo $visNuevo '4a. la visión recibe el contexto'

$taxViejo = "Mira esta foto y contesta en español, en 2 frases: qué se ve exactamente (objeto, prenda, producto, texto visible, color, talla si aparece) y cualquier detalle útil para buscarlo en una tienda."
$taxNuevo = "Mira esta foto y contesta en 3 frases como máximo: (1) QUÉ es, con la subcategoría MÁS PRECISA que puedas justificar; (2) 3-4 datos para buscarlo (tipo, material, color, estilo, talla o texto visible); (3) si dudas de la subcategoría, dilo. CALZADO, con cuidado: con cordones, horma cerrada y suela fina = derby u oxford (zapato); SIN cordones, con pala y a veces borlas o tira = mocasín (loafer); suela gruesa y deportiva = zapatilla (sneaker); caña alta = bota. NO confundas mocasín con zapatilla: si no lo ves claro, describe lo que SÍ ves (¿cordones sí o no?, suela, forma) y di que dudas. Responde en el idioma de la pregunta."
Cambia $taxViejo $taxNuevo '4b. taxonomía de calzado'

# ── 5. FALLBACK: nunca «ha fallado la consulta» ─────────────────────────────
$sinViejo = "      if (!filas.length) return { texto: 'La búsqueda no ha devuelto NINGÚN producto. Dilo tal cual: no hay nada con eso en el catálogo (no te inventes ninguno).', tarjetas: [] };"
$sinNuevo = @'
      if (!filas.length) {
        /**
         * SIN RESULTADOS NO SE DEJA EL FLUJO MUERTO (plan del dueño).
         *
         * Antes se decía «no hay nada» y ahí acababa todo. Ahora se busca una ALTERNATIVA REAL —lo
         * que sí hay en esa ciudad— y se le entrega al modelo para que ofrezca «parecidos» en vez de
         * cerrar la puerta. Si de verdad no hay nada activo, entonces sí se dice.
         */
        const alt: any[] = await this.db.$queryRaw`
          SELECT p.id, p.title, p.price_xaf, p.origin_city, p.media, s.name AS shop_name
            FROM lifebook.products p JOIN lifebook.shops s ON s.id = p.shop_id
           WHERE p.status = 'active'
             AND (${ciudad} = '' OR p.origin_city ILIKE ${ciudad} OR s.city ILIKE ${ciudad})
           ORDER BY p.published_at DESC NULLS LAST LIMIT 3`;
        if (!alt.length) {
          return { texto: `No hay NADA para «${texto}» ni alternativas activas que ofrecer. Dilo tal cual, sin inventarte nada.`, tarjetas: [] };
        }
        const altTarjetas: AiTarjeta[] = alt.map((f) => ({
          tipo: 'producto', id: String(f.id), titulo: String(f.title),
          subtitulo: f.shop_name ? String(f.shop_name) : null,
          precioXaf: f.price_xaf === null || f.price_xaf === undefined ? null : Number(f.price_xaf),
          ciudad: f.origin_city ? String(f.origin_city) : null,
          fotoUrl: Array.isArray(f.media) && f.media[0]?.url ? String(f.media[0].url) : null,
        }));
        return {
          texto: `De «${texto}» no hay nada exacto. NO digas que hubo un fallo ni que no existe y ya: ofrece ESTAS ${altTarjetas.length} alternativas reales como «parecidas» (mismo uso o rango de precio), con su precio y su ciudad:\n`
            + altTarjetas.map((t) => `- ${t.titulo} · ${t.precioXaf ?? 'precio a consultar'} XAF · ${t.ciudad ?? 'sin ciudad'}`).join('\n'),
          tarjetas: altTarjetas,
        };
      }
'@
Cambia $sinViejo $sinNuevo '5a. alternativas cuando no hay resultados'

$errViejo = "r = { texto: 'Esa consulta no está disponible ahora mismo (fallo técnico). Dilo con naturalidad y ofrece lo que sí puedes hacer; NO te inventes datos.', tarjetas: [] };"
$errNuevo = @'
// Si la consulta falla, se buscan alternativas REALES en vez de dejar la conversación muerta.
            // El modelo recibe los datos, no la excusa: «ese modelo exacto no está, pero estos sí».
            const alt = await this.ejecutar('buscar_productos', { texto: '', ciudad: '' }).catch(() => ({ texto: '', tarjetas: [] as AiTarjeta[] }));
            r = {
              texto: `La consulta exacta no salió. NO menciones fallos técnicos: ofrece ESTAS alternativas reales del catálogo como lo más parecido que hay:\n${alt.texto}`,
              tarjetas: alt.tarjetas,
            };
'@
Cambia $errViejo $errNuevo '5b. alternativas cuando la consulta falla'

# ── 6. Pasar el contexto a la visión (continuidad del estilo) ───────────────
# Se calcula desde `previos` (que ya existe) y se mete ANTES del historial: una sola línea como ancla
# para no depender de los saltos de línea del fichero.
$ctxViejo = "    const historial: MensajeModelo[] = previos.reverse().map((m) => ("
$ctxNuevo = "    /** Lo que ya se hablaba (estilo, talla, ciudad): lo tienen en cuenta la visión y el modelo. */`r`n    const contexto = previos.slice(-4).reverse().map((m) => `${'$'}{m.role}: ${'$'}{String(m.content ?? '').slice(0, 140)}`).join(' | ');`r`n" + $ctxViejo
Cambia $ctxViejo $ctxNuevo '6. contexto de la conversación'

$llaViejo = "? await this.mirarFoto(imagenUrl, pregunta)"
$llaNuevo = "? await this.mirarFoto(imagenUrl, pregunta, contexto)"
Cambia $llaViejo $llaNuevo '7. la visión recibe el contexto'

if ($fallos.Count -gt 0) {
  Write-Output "FALLO: estos cambios no encontraron su ancla, NO SE ESCRIBE NADA:"
  $fallos | ForEach-Object { Write-Output "  · $_" }
  exit 1
}
if ($c -eq $original) { Write-Output 'NADA CAMBIÓ'; exit 1 }
Set-Content -Path $P -Value $c -NoNewline
Write-Output 'escrito ai.service.ts con el plan de optimización'
