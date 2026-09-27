// =============================================================================
// ai.service.ts — EL ASISTENTE DE IA DE LIFE BOOK (tanda M)
//
// QUÉ ES. Un chat dentro de Life Book que:
//   · RECOMIENDA COSAS REALES del catálogo (productos y tiendas que existen, con su precio y su
//     ciudad sacados de la base) — nunca inventadas;
//   · explica CÓMO SE USA la app (publicar, tallas, aviso de reposición, cupones, carrito, hotel…)
//     con textos que salen de esta casa, no de la imaginación del modelo.
//
// DECISIONES QUE NO SE NEGOCIAN (son las reglas del dueño):
//   1. **El modelo no toca la base.** Solo puede llamar a las herramientas de aquí abajo, que
//      consultan el catálogo PÚBLICO. No hay una herramienta que lea teléfonos, correos, direcciones
//      ni medidas corporales, y el prompt lo dice.
//   2. **Lo que no sabe, lo dice.** Si una búsqueda no devuelve nada, contesta que no hay nada; no
//      rellena huecos con precios o existencias plausibles.
//   3. **Hay tope de gasto.** Cada persona tiene un máximo de mensajes al día y cada respuesta un
//      máximo de tokens; el gasto se apunta en `ai_usage`. Una IA sin tope es una factura sin tope.
//   4. **Sin clave configurada, se dice.** El asistente responde con un error claro en vez de fallar
//      de forma rara.
//
// La clave vive en el `.env` del servidor (`AI_API_KEY`), nunca en el repositorio ni en la app.
// =============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { DomainError } from '../services/payment-auth.service';

/** Lo que el asistente puede enseñar además del texto (cosas REALES, cada una abre su pantalla). */
export interface AiTarjeta {
  tipo: 'producto' | 'tienda' | 'comida' | 'alquiler' | 'alojamiento';
  id: string;
  titulo: string;
  subtitulo: string | null;
  precioXaf: number | null;
  ciudad: string | null;
  fotoUrl: string | null;
}

interface MensajeModelo {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

const MAX_RONDAS_HERRAMIENTAS = 4;
const MAX_HISTORIAL = 12;          // mensajes de contexto que se mandan al modelo
const MAX_TOKENS_RESPUESTA = 700;
const MAX_MENSAJES_DIA = Number(process.env.AI_DAILY_MESSAGES ?? 60);
const MAX_LARGO_PREGUNTA = 500;

/**
 * LO QUE EL ASISTENTE SABE DE LA APP, escrito aquí y no dejado al modelo.
 *
 * Es la diferencia entre un asistente que explica el Life Book de verdad y uno que se inventa
 * botones. Cada entrada sale de lo que la app hace hoy (ver `docs/`).
 */
const GUIA: { clave: string; titulo: string; texto: string }[] = [
  {
    clave: 'publicar',
    titulo: 'Publicar (vender)',
    texto: 'En Life Book, «Publicar» está en Mi tienda → Publicar. Son pasos: tipo y categoría, fotos, datos y precio, y opciones y entrega. En «Opciones» se ponen las tallas y los colores: cada color necesita su FOTO real del producto en ese color, y las combinaciones se generan solas con su precio y su stock. Después de publicar, la publicación pasa por revisión antes de verse.',
  },
  {
    clave: 'tallas',
    titulo: 'Tallas y medidas',
    texto: 'En la ficha, al pulsar «Comprar» o «Añadir al carrito» se abre el selector: ahí se elige talla, color y cantidad. En el bloque de tallas hay un enlace «¿No sabes tu talla?»: si la tienda ha configurado su tabla, el asistente compara tu altura, tu peso y tu número de calzado con ESA tabla y te dice la talla con su motivo. Tus medidas se quedan en tu cuenta: la tienda solo ve la talla que elijas. Si la tienda no ha configurado tabla, se dice y no se inventa una talla.',
  },
  {
    clave: 'aviso',
    titulo: 'Aviso cuando llegue (sin stock)',
    texto: 'Si un producto o una talla está agotada, se puede pedir el aviso: «Avísame cuando llegue». Se apunta por combinación (por ejemplo la «Rojo · M») y, cuando la tienda repone, el aviso llega por el chat con la tienda.',
  },
  {
    clave: 'carrito',
    titulo: 'Carrito y pedido',
    texto: 'El carrito se agrupa por tienda y se paga un pedido por tienda. Cada línea lleva su combinación (por ejemplo «Rojo · M») y su precio. Antes de pagar se eligen la entrega y la forma de pago, y el pedido se sigue desde «Mis pedidos»; el comerciante lo ve en su panel.',
  },
  {
    clave: 'cupones',
    titulo: 'Cupones',
    texto: 'La tienda crea cupones (descuento fijo o porcentaje, con mínimo de compra y caducidad) y la persona los recoge; los cupones de una tienda se aplican a los pedidos de esa tienda.',
  },
  {
    clave: 'ciudad',
    titulo: 'Ciudad y distancia',
    texto: 'En la pestaña «Ciudad» se ven publicaciones de la zona, con chips de distancia (cerca, 3 km, toda la ciudad) y ordenación. La distancia se mide desde tu posición o desde el centro de la ciudad si cambias de ciudad a mano. Para publicar se puede elegir el sitio exacto (POI).',
  },
  {
    clave: 'hotel',
    titulo: 'Alojamiento',
    texto: 'Las habitaciones se reservan por fechas y huéspedes en la ficha del hotel, no se compran como un producto: ahí se comprueba disponibilidad, estancia mínima y capacidad. El hotel las gestiona desde su panel.',
  },
  {
    clave: 'pagos',
    titulo: 'Formas de pago',
    texto: 'Las formas de pago las acepta cada tienda (efectivo contra entrega, transferencia, monedero Life Book, pago en tienda…). En la caja se elige la que ofrezca esa tienda.',
  },
  // ── LOS DEMÁS SERVICIOS DE LA APP (tanda M-bis) ────────────────────────────
  {
    clave: 'taxi',
    titulo: 'Taxi y viajes en coche',
    texto: 'En el inicio están «Llamar Taxi» (un taxi ahora), «Ciudad a Ciudad» (viajes entre ciudades, con rutas y asientos), «Ser Conductor» (darse de alta como conductor) y «Reservar Coche» (alquilar un coche). El taxi se pide desde la pantalla de inicio, con tu ubicación.',
  },
  {
    clave: 'comida',
    titulo: 'Comida a domicilio',
    texto: 'En «Comida Rápida» se ven los restaurantes de tu ciudad; al entrar en uno está su menú con precios, y se pide desde ahí (carrito propio de comida, distinto del carrito del mercado). El reparto lo hace un rider y el pedido se sigue desde «Mis pedidos de comida». Si tienes un restaurante, se gestiona desde el panel de dueño.',
  },
  {
    clave: 'alquiler',
    titulo: 'Alquiler de casas y locales',
    texto: 'En «Buscar Alquiler» se ven casas, apartamentos y locales por ciudad y barrio, con el precio (al mes o por noche), habitaciones y servicios. Cada anuncio tiene su ficha con fotos y la forma de contactar. El precio suele ser mensual; algunos se alquilan por noches.',
  },
  {
    clave: 'trabajo',
    titulo: 'Trabajo',
    texto: 'En «Buscar Work» están las ofertas de empleo por ciudad, con el sueldo, el tipo de contrato y lo que piden. Desde cada oferta se envía la candidatura. Si publicas una oferta, las candidaturas se gestionan en tu espacio de ofertas.',
  },
  {
    clave: 'viajes',
    titulo: 'Viajes entre ciudades',
    texto: '«Ciudad a Ciudad» muestra las rutas entre ciudades con su precio y sus asientos; se reserva el asiento desde ahí y el billete queda en tus billetes. El conductor publica el viaje con su vehículo y su hora de salida.',
  },
  {
    clave: 'documentos',
    titulo: 'Documentos, emergencia y ubicación',
    texto: 'En el inicio hay accesos para escanear un documento, pedir ayuda de emergencia y compartir tu ubicación actual. Los documentos escaneados se guardan en tu cuenta.',
  },
  {
    clave: 'mensajes',
    titulo: 'Mensajes y grupos',
    texto: '«Mensajes» está en la barra de abajo y lleva el contador de lo que no has leído: ahí están los chats con tiendas y personas, y los grupos. Dentro de un chat se pueden mandar tarjetas de producto y tarjetas de pedido, y el pedido se sigue desde la propia conversación.',
  },
  {
    clave: 'cuenta',
    titulo: 'Tu cuenta y tu perfil',
    texto: 'En «Perfil» están tus datos, tu código QR, tus seguidores y tus negocios. En «Editar perfil» se cambian el nombre, la foto, la ciudad y tus medidas de talla; también se pueden ver y borrar tus medidas desde ahí.',
  },
  {
    clave: 'facturacion',
    titulo: 'Planes y facturación',
    texto: 'La app tiene planes de pago (por ejemplo para conductores o comercios) que se contratan desde la pantalla del plan; el estado del cobro y las facturas se ven en la pantalla de facturación.',
  },
];

@Injectable()
export class LifebookAiService {
  private readonly log = new Logger('LifebookAi');

  constructor(private readonly db: MobilityPrismaService) {}

  /** ¿Está configurado el asistente? (la clave vive en el `.env` del servidor). */
  private get clave(): string {
    return String(process.env.AI_API_KEY ?? '').trim();
  }
  private get modelo(): string {
    return String(process.env.AI_MODEL ?? 'deepseek-chat').trim();
  }
  private get baseUrl(): string {
    return String(process.env.AI_BASE_URL ?? 'https://api.deepseek.com/v1').trim().replace(/\/+$/, '');
  }

  /**
   * LA VISTA (tanda N) — el modelo que SÍ ve imágenes.
   *
   * Medido con las claves en la mano: DeepSeek **rechaza** las imágenes por su API, Google está
   * **bloqueado por región** desde este servidor («User location is not supported for the API use») y
   * OpenAI también («Country, region, or territory not supported»). El que funciona aquí es **Qwen
   * (DashScope)** con `qwen-vl-max`. El texto sigue yendo por DeepSeek; solo la foto va a este modelo.
   */
  private get claveVision(): string {
    return String(process.env.AI_VISION_KEY ?? '').trim();
  }
  private get modeloVision(): string {
    return String(process.env.AI_VISION_MODEL ?? 'qwen-vl-max').trim();
  }
  private get baseUrlVision(): string {
    return String(process.env.AI_VISION_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1').trim().replace(/\/+$/, '');
  }

  /**
   * MIRAR UNA FOTO: se la manda al modelo que ve (Qwen) junto con la pregunta, y devuelve lo que ha
   * visto EN TEXTO. Ese texto entra en la conversación como resultado de herramienta, así que el
   * asistente puede después buscar en el catálogo con lo que ha reconocido.
   */
  async mirarFoto(imagenUrl: string, pregunta: string, contexto = ''): Promise<string> {
    if (!this.claveVision) return 'No hay modelo con visión configurado, así que NO puedo ver la foto. Dilo tal cual.';
    try {
      const r = await fetch(`${this.baseUrlVision}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.claveVision}` },
        body: JSON.stringify({
          model: this.modeloVision,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: `Mira esta foto y contesta en 3 frases como máximo: (1) QUÉ es, con la subcategoría MÁS PRECISA que puedas justificar; (2) 3-4 datos para buscarlo (tipo, material, color, estilo, talla o texto visible); (3) si dudas de la subcategoría, dilo. CALZADO, con cuidado: con cordones, horma cerrada y suela fina = derby u oxford (zapato); SIN cordones, con pala y a veces borlas o tira = mocasín (loafer); suela gruesa y deportiva = zapatilla (sneaker); caña alta = bota. NO confundas mocasín con zapatilla: si no lo ves claro, describe lo que SÍ ves (¿cordones sí o no?, suela, forma) y di que dudas. Responde en el idioma de la pregunta. Contexto de la conversación (respeta el estilo del que se venía hablando): ${contexto}. Pregunta de la persona: ${pregunta}` },
              { type: 'image_url', image_url: { url: imagenUrl } },
            ],
          }],
          max_tokens: 300,
        }),
      });
      const cuerpo: any = await r.json().catch(() => null);
      if (!r.ok) {
        this.log.error(`La visión respondió ${r.status}: ${JSON.stringify(cuerpo).slice(0, 200)}`);
        return 'No se pudo mirar la foto (fallo del servicio de visión). Dilo tal cual y ofrece ayuda por texto.';
      }
      const texto = String(cuerpo?.choices?.[0]?.message?.content ?? '').trim();
      return texto || 'La foto no se pudo interpretar. Dilo tal cual.';
    } catch (e) {
      this.log.error(`Visión inalcanzable: ${e instanceof Error ? e.message : e}`);
      return 'No se pudo mirar la foto (no se pudo contactar con el servicio de visión). Dilo tal cual.';
    }
  }

  async estado(userId: string) {
    const usados = await this.usoDeHoy(userId);
    return {
      configured: !!this.clave,
      model: this.modelo,
      dailyLimit: MAX_MENSAJES_DIA,
      usedToday: usados.messages,
      leftToday: Math.max(0, MAX_MENSAJES_DIA - usados.messages),
    };
  }

  private async usoDeHoy(userId: string): Promise<{ messages: number; tokens: number }> {
    const filas: any[] = await this.db.$queryRaw`
      SELECT messages, tokens FROM lifebook.ai_usage
       WHERE user_id = ${userId}::uuid AND day = (now() AT TIME ZONE 'UTC')::date`;
    return { messages: Number(filas[0]?.messages ?? 0), tokens: Number(filas[0]?.tokens ?? 0) };
  }

  /** La conversación abierta (la última). Si no hay ninguna, se crea al primer mensaje. */
  async conversacion(userId: string, conversationId?: string | null) {
    const cid = conversationId ? this.uuidOrNull(conversationId) : null;
    const filas: any[] = cid
      ? await this.db.$queryRaw`
          SELECT id, title, created_at, updated_at FROM lifebook.ai_conversations
           WHERE id = ${cid}::uuid AND user_id = ${userId}::uuid LIMIT 1`
      : await this.db.$queryRaw`
          SELECT id, title, created_at, updated_at FROM lifebook.ai_conversations
           WHERE user_id = ${userId}::uuid ORDER BY updated_at DESC LIMIT 1`;
    const conv = filas[0] ?? null;
    if (!conv) return { conversation: null, messages: [] };
    const mensajes: any[] = await this.db.$queryRaw`
      SELECT id, role, content, payload, created_at FROM lifebook.ai_messages
       WHERE conversation_id = ${conv.id}::uuid ORDER BY created_at ASC LIMIT 100`;
    return {
      conversation: { id: conv.id, title: conv.title, updatedAt: conv.updated_at },
      messages: mensajes.map((m) => ({
        id: m.id,
        role: String(m.role),
        text: m.content ?? '',
        cards: Array.isArray(m.payload) ? m.payload : [],
        createdAt: m.created_at,
      })),
    };
  }

  /** Empezar de cero: se crea una conversación nueva (la anterior se queda guardada). */
  async nueva(userId: string) {
    const filas: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.ai_conversations (user_id, title)
      VALUES (${userId}::uuid, ${'Nueva conversación'})
      RETURNING id, title, updated_at`;
    return { conversation: { id: filas[0].id, title: filas[0].title, updatedAt: filas[0].updated_at }, messages: [] };
  }

  private uuidOrNull(v: unknown): string | null {
    const s = String(v ?? '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
  }

  // ─────────────────────────── LAS HERRAMIENTAS ─────────────────────────────
  /**
   * Lo único que el modelo puede EJECUTAR. Todas leen el catálogo PÚBLICO y devuelven datos reales;
   * ninguna toca datos personales de nadie.
   */
  private herramientas = [
    {
      type: 'function' as const,
      function: {
        name: 'buscar_productos',
        description: 'Busca productos y servicios REALES del catálogo de Life Book. Acepta palabras de producto (zapatillas, arroz, móvil), pero también ESTILOS (blokecore, retro, formal) y USOS (boda, playa, oficina): tradúcelos tú a palabras de producto y llama varias veces, una por categoría, para armar el look. Devuelve productos con su precio y su ciudad.',
        parameters: {
          type: 'object',
          properties: {
            texto: { type: 'string', description: 'Qué busca, en pocas palabras (ej.: «zapatillas», «arroz», «móvil»)' },
            ciudad: { type: 'string', description: 'Ciudad, si la ha dicho (ej.: Malabo, Bata)' },
            precioMax: { type: 'number', description: 'Precio máximo en XAF, si lo ha dicho' },
          },
          required: ['texto'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'ver_producto',
        description: 'Ficha de un producto concreto: precio, existencias, opciones (tallas, colores) y tienda. Úsala cuando pregunten por el detalle o por una talla concreta.',
        parameters: { type: 'object', properties: { id: { type: 'string', description: 'El id del producto (viene de buscar_productos)' } }, required: ['id'] },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'buscar_tiendas',
        description: 'Busca TIENDAS reales de Life Book por nombre o ciudad. Úsala si preguntan por una tienda concreta o por qué tiendas hay en una ciudad.',
        parameters: { type: 'object', properties: { texto: { type: 'string' }, ciudad: { type: 'string' } }, required: [] },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'buscar_comida',
        description: 'Busca PLATOS reales de restaurantes (comida a domicilio) por nombre o ciudad. Devuelve platos con su precio y su restaurante.',
        parameters: { type: 'object', properties: { texto: { type: 'string', description: 'Qué busca (ej.: pollo, pizza, arroz)' }, ciudad: { type: 'string' } }, required: [] },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'buscar_alquiler',
        description: 'Busca CASAS, apartamentos y locales en alquiler reales, por ciudad, tipo y precio. Devuelve el precio (al mes o por noche), las habitaciones y el barrio.',
        parameters: {
          type: 'object',
          properties: {
            ciudad: { type: 'string' }, tipo: { type: 'string', description: 'casa, apartamento, local…' },
            habitaciones: { type: 'number' }, precioMax: { type: 'number', description: 'Alquiler mensual máximo en XAF' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'buscar_trabajo',
        description: 'Busca OFERTAS DE EMPLEO reales por puesto o ciudad. Devuelve el puesto, la empresa, el sueldo y el tipo de contrato.',
        parameters: { type: 'object', properties: { texto: { type: 'string' }, ciudad: { type: 'string' } }, required: [] },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'buscar_viajes',
        description: 'Busca RUTAS entre ciudades (Ciudad a Ciudad) por origen y destino. Devuelve la distancia, el precio base y la duración estimada.',
        parameters: { type: 'object', properties: { origen: { type: 'string' }, destino: { type: 'string' } }, required: [] },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'buscar_alojamiento',
        description: 'Busca HABITACIONES de hotel reales por ciudad y número de personas. Devuelve el tipo de habitación, la capacidad y el precio por noche.',
        parameters: { type: 'object', properties: { ciudad: { type: 'string' }, personas: { type: 'number' } }, required: [] },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'como_se_hace',
        description: 'Explica cómo se hace algo en la app (publicar, tallas, aviso de stock, cupones, carrito, ciudad, hotel, pagos). Úsala para las preguntas de «¿cómo…?».',
        parameters: { type: 'object', properties: { tema: { type: 'string', description: `Uno de: ${GUIA.map((g) => g.clave).join(', ')}` } }, required: ['tema'] },
      },
    },
  ];

  private async ejecutar(nombre: string, args: any): Promise<{ texto: string; tarjetas: AiTarjeta[] }> {
    if (nombre === 'buscar_productos') {
      const texto = String(args?.texto ?? '').trim().slice(0, 60);
      const ciudad = String(args?.ciudad ?? '').trim().slice(0, 60);
      const precioMax = Number(args?.precioMax);
      const qs = new URLSearchParams();
      if (texto) qs.append('q', texto);
      if (ciudad) qs.append('city', ciudad);
      if (Number.isFinite(precioMax) && precioMax > 0) qs.append('priceMax', String(Math.round(precioMax)));
      qs.append('limit', '6');
      const filas: any[] = await this.db.$queryRaw`
        SELECT p.id, p.title, p.price_xaf, p.price_mode, p.short_description, p.origin_city,
               p.media, s.name AS shop_name, s.city AS shop_city
          FROM lifebook.products p
          JOIN lifebook.shops s ON s.id = p.shop_id
         WHERE p.status = 'active'
           AND (${texto} = '' OR p.title ILIKE ${'%' + texto + '%'} OR p.short_description ILIKE ${'%' + texto + '%'})
           AND (${ciudad} = '' OR p.origin_city ILIKE ${ciudad} OR s.city ILIKE ${ciudad})
           AND (${Number.isFinite(precioMax) && precioMax > 0 ? Math.round(precioMax) : 0} = 0 OR (p.price_xaf IS NOT NULL AND p.price_xaf <= ${Number.isFinite(precioMax) && precioMax > 0 ? Math.round(precioMax) : 0}))
         ORDER BY p.published_at DESC NULLS LAST
         LIMIT 6`;
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
      const tarjetas: AiTarjeta[] = filas.map((f) => ({
        tipo: 'producto',
        id: String(f.id),
        titulo: String(f.title),
        subtitulo: f.shop_name ? String(f.shop_name) : null,
        precioXaf: f.price_xaf === null || f.price_xaf === undefined ? null : Number(f.price_xaf),
        ciudad: f.origin_city ? String(f.origin_city) : (f.shop_city ? String(f.shop_city) : null),
        fotoUrl: Array.isArray(f.media) && f.media[0]?.url ? String(f.media[0].url) : null,
      }));
      return {
        texto: `${tarjetas.length} producto(s) REALES del catálogo:\n` + tarjetas
          .map((t) => `- id=${t.id} · ${t.titulo} · ${t.precioXaf === null ? 'precio a consultar' : t.precioXaf + ' XAF'} · ${t.ciudad ?? 'sin ciudad'} · ${t.subtitulo ?? ''}`)
          .join('\n'),
        tarjetas,
      };
    }

    if (nombre === 'ver_producto') {
      const pid = this.uuidOrNull(args?.id);
      if (!pid) return { texto: 'Ese id no es válido.', tarjetas: [] };
      const filas: any[] = await this.db.$queryRaw`
        SELECT p.id, p.title, p.long_description, p.price_xaf, p.price_mode, p.stock_mode, p.stock_quantity,
               p.origin_city, p.condition, p.media, p.service_type,
               s.id AS shop_id, s.name AS shop_name, s.city AS shop_city, s.is_verified
          FROM lifebook.products p JOIN lifebook.shops s ON s.id = p.shop_id
         WHERE p.id = ${pid}::uuid AND p.status = 'active' LIMIT 1`;
      const p = filas[0];
      if (!p) return { texto: 'Ese producto no existe o ya no está a la venta. Dilo tal cual.', tarjetas: [] };
      const variantes: any[] = await this.db.$queryRaw`
        SELECT name, price_xaf, stock_quantity FROM lifebook.product_variants
         WHERE product_id = ${pid}::uuid ORDER BY position, name`;
      const envio: any[] = await this.db.$queryRaw`
        SELECT coverage, transport_modes FROM lifebook.shipping_policies WHERE id = p.shipping_policy_id LIMIT 1`;
      const cobertura = Array.isArray(envio[0]?.coverage) ? envio[0].coverage.join(', ') : 'no declarada';
      const texto = [
        `id=${p.id} · ${p.title}`,
        p.long_description ? String(p.long_description).slice(0, 400) : '',
        `precio: ${p.price_xaf === null ? 'a consultar' : p.price_xaf + ' XAF'} (${p.price_mode})`,
        `existencias: ${p.stock_mode === 'exact' ? p.stock_quantity + ' unidades' : p.stock_mode}`,
        `tienda: ${p.shop_name} (${p.city ?? 'sin ciudad'}${p.is_verified ? ', verificada' : ''})`,
        variantes.length ? 'opciones: ' + variantes.map((v) => `${v.name} (${v.price_xaf === null ? 'precio del producto' : v.price_xaf + ' XAF'}, stock ${v.stock_quantity})`).join(' · ') : 'sin opciones',
        `envío: ${cobertura}`,
      ].filter(Boolean).join('\n');
      return {
        texto,
        tarjetas: [{
          tipo: 'producto', id: String(p.id), titulo: String(p.title), subtitulo: p.shop_name ? String(p.shop_name) : null,
          precioXaf: p.price_xaf === null ? null : Number(p.price_xaf),
          ciudad: p.origin_city ? String(p.origin_city) : null,
          fotoUrl: Array.isArray(p.media) && p.media[0]?.url ? String(p.media[0].url) : null,
        }],
      };
    }

    if (nombre === 'buscar_tiendas') {
      const texto = String(args?.texto ?? '').trim().slice(0, 60);
      const ciudad = String(args?.ciudad ?? '').trim().slice(0, 60);
      const filas: any[] = await this.db.$queryRaw`
        SELECT s.id, s.name, s.city, s.region, s.is_verified, s.logo_url,
               (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = s.id AND p.status = 'active') AS productos
          FROM lifebook.shops s
         WHERE s.is_active
           AND (${texto} = '' OR s.name ILIKE ${'%' + texto + '%'})
           AND (${ciudad} = '' OR s.city ILIKE ${ciudad})
         ORDER BY s.is_verified DESC, s.rating DESC NULLS LAST
         LIMIT 6`;
      if (!filas.length) return { texto: 'No hay tiendas con eso. Dilo tal cual.', tarjetas: [] };
      return {
        texto: filas.map((f) => `- id=${f.id} · ${f.name} · ${f.city ?? 'sin ciudad'} · ${f.productos} productos activos`).join('\n'),
        tarjetas: filas.map((f) => ({
          tipo: 'tienda' as const, id: String(f.id), titulo: String(f.name),
          subtitulo: `${f.productos} productos`, precioXaf: null,
          ciudad: f.city ? String(f.city) : null,
          fotoUrl: f.logo_url ? String(f.logo_url) : null,
        })),
      };
    }

    if (nombre === 'buscar_comida') {
      const texto = String(args?.texto ?? '').trim().slice(0, 60);
      const ciudad = String(args?.ciudad ?? '').trim().slice(0, 60);
      const filas: any[] = await this.db.$queryRaw`
        SELECT i.id, i.name, i.price_xaf, i.description, i.photos,
               r.id AS restaurante_id, r.business_name, r.city
          FROM wallet.food_menu_items i
          JOIN wallet.food_restaurants r ON r.id = i.restaurant_id
         WHERE i.available AND i.status = 'active' AND r.status = 'active'
           AND (${texto} = '' OR i.name ILIKE ${'%' + texto + '%'} OR i.description ILIKE ${'%' + texto + '%'} OR i.category ILIKE ${'%' + texto + '%'})
           AND (${ciudad} = '' OR r.city ILIKE ${ciudad})
         ORDER BY i.price_xaf ASC
         LIMIT 6`;
      if (!filas.length) return { texto: 'No hay platos activos con eso. Dilo tal cual.', tarjetas: [] };
      return {
        texto: filas.map((f) => `- ${f.name} · ${f.price_xaf} XAF · ${f.business_name} (${f.city ?? 'sin ciudad'}) · restauranteId=${f.restaurante_id}`).join('\n'),
        tarjetas: filas.map((f) => ({
          tipo: 'comida' as const, id: String(f.restaurante_id), titulo: String(f.name),
          subtitulo: String(f.business_name), precioXaf: Number(f.price_xaf ?? 0),
          ciudad: f.city ? String(f.city) : null,
          fotoUrl: Array.isArray(f.photos) && f.photos[0] ? String(f.photos[0]) : null,
        })),
      };
    }

    if (nombre === 'buscar_alquiler') {
      const ciudad = String(args?.ciudad ?? '').trim().slice(0, 60);
      const tipo = String(args?.tipo ?? '').trim().slice(0, 40);
      const habitaciones = Number(args?.habitaciones);
      const precioMax = Number(args?.precioMax);
      const filas: any[] = await this.db.$queryRaw`
        SELECT p.id, p.title, p.type, p.monthly_rent, p.price_per_night, p.rooms, p.bathrooms,
               p.city_name, p.neighborhood, p.rental_type
          FROM wallet.rental_properties p
         WHERE p.status = 'open' AND p.reported_as_fraud = false
           AND (${ciudad} = '' OR p.city_name ILIKE ${ciudad})
           AND (${tipo} = '' OR p.type ILIKE ${'%' + tipo + '%'})
           AND (${Number.isFinite(habitaciones) && habitaciones > 0 ? Math.round(habitaciones) : 0} = 0 OR p.rooms >= ${Number.isFinite(habitaciones) && habitaciones > 0 ? Math.round(habitaciones) : 0})
           AND (${Number.isFinite(precioMax) && precioMax > 0 ? Math.round(precioMax) : 0} = 0 OR (p.monthly_rent IS NOT NULL AND p.monthly_rent <= ${Number.isFinite(precioMax) && precioMax > 0 ? Math.round(precioMax) : 0}))
         ORDER BY p.is_featured DESC, p.published_at DESC NULLS LAST
         LIMIT 6`;
      if (!filas.length) return { texto: 'No hay alquileres activos con eso. Dilo tal cual.', tarjetas: [] };
      return {
        texto: filas.map((f) => `- ${f.title} · ${f.type ?? ''} · ${f.monthly_rent ? f.monthly_rent + ' XAF/mes' : (f.price_per_night ? f.price_per_night + ' XAF/noche' : 'precio a consultar')} · ${f.rooms ?? '?'} hab · ${f.neighborhood ?? ''} ${f.city_name ?? ''} · id=${f.id}`).join('\n'),
        tarjetas: filas.map((f) => ({
          tipo: 'alquiler' as const, id: String(f.id), titulo: String(f.title),
          subtitulo: [f.type, f.rooms ? `${f.rooms} hab` : null, f.neighborhood].filter(Boolean).join(' · ') || null,
          precioXaf: f.monthly_rent ? Number(f.monthly_rent) : (f.price_per_night ? Number(f.price_per_night) : null),
          ciudad: f.city_name ? String(f.city_name) : null, fotoUrl: null,
        })),
      };
    }

    if (nombre === 'buscar_trabajo') {
      const texto = String(args?.texto ?? '').trim().slice(0, 60);
      const ciudad = String(args?.ciudad ?? '').trim().slice(0, 60);
      const filas: any[] = await this.db.$queryRaw`
        SELECT id, title, company, city, salary_min, salary_max, salary_label, contract_label, category
          FROM wallet.jobs
         WHERE status = 'open'
           AND (${texto} = '' OR title ILIKE ${'%' + texto + '%'} OR company ILIKE ${'%' + texto + '%'} OR category ILIKE ${'%' + texto + '%'})
           AND (${ciudad} = '' OR city ILIKE ${ciudad})
         ORDER BY is_featured DESC, published_at DESC NULLS LAST
         LIMIT 6`;
      if (!filas.length) return { texto: 'No hay ofertas activas con eso. Dilo tal cual. (Las ofertas se ven en «Buscar Work», en el inicio.)', tarjetas: [] };
      return {
        // Sin tarjeta: en esta app las ofertas se gestionan en su propio entorno, no hay pantalla a la que llevar.
        texto: filas.map((f) => `- ${f.title} · ${f.company ?? ''} · ${f.city ?? 'sin ciudad'} · ${f.salary_label ?? (f.salary_min ? `${f.salary_min}-${f.salary_max ?? ''} XAF` : 'sueldo a consultar')} · ${f.contract_label ?? ''}`).join('\n'),
        tarjetas: [],
      };
    }

    if (nombre === 'buscar_viajes') {
      const origen = String(args?.origen ?? '').trim().slice(0, 60);
      const destino = String(args?.destino ?? '').trim().slice(0, 60);
      const filas: any[] = await this.db.$queryRaw`
        SELECT origin_city, destination_city, distance_km, estimated_min, base_price, currency
          FROM wallet.intercity_routes
         WHERE is_active
           AND (${origen} = '' OR origin_city ILIKE ${'%' + origen + '%'})
           AND (${destino} = '' OR destination_city ILIKE ${'%' + destino + '%'})
         ORDER BY base_price ASC
         LIMIT 6`;
      if (!filas.length) return { texto: 'No hay rutas activas con eso. Dilo tal cual. Las rutas y los asientos se ven en «Ciudad a Ciudad», en el inicio.', tarjetas: [] };
      return {
        texto: filas.map((f) => `- ${f.origin_city} → ${f.destination_city} · ${f.distance_km ?? '?'} km · ${f.estimated_min ?? '?'} min · desde ${f.base_price ?? '?'} ${f.currency ?? 'XAF'}`).join('\n'),
        tarjetas: [],
      };
    }

    if (nombre === 'buscar_alojamiento') {
      const ciudad = String(args?.ciudad ?? '').trim().slice(0, 60);
      const personas = Number(args?.personas);
      const filas: any[] = await this.db.$queryRaw`
        SELECT rt.id, rt.name, rt.capacity, rt.base_price_xaf, rt.min_nights, s.id AS shop_id, s.name AS hotel, s.city
          FROM lifebook.room_types rt
          JOIN lifebook.shops s ON s.id = rt.shop_id
         WHERE rt.is_active AND s.is_active
           AND (${ciudad} = '' OR s.city ILIKE ${ciudad})
           AND (${Number.isFinite(personas) && personas > 0 ? Math.round(personas) : 0} = 0 OR rt.capacity >= ${Number.isFinite(personas) && personas > 0 ? Math.round(personas) : 0})
         ORDER BY rt.base_price_xaf ASC
         LIMIT 6`;
      if (!filas.length) return { texto: 'No hay habitaciones activas con eso. Dilo tal cual.', tarjetas: [] };
      return {
        texto: filas.map((f) => `- ${f.name} · ${f.hotel} (${f.city ?? 'sin ciudad'}) · hasta ${f.capacity} personas · ${f.base_price_xaf} XAF/noche · mínimo ${f.min_nights ?? 1} noche(s) · hotelId=${f.shop_id}`).join('\n'),
        tarjetas: filas.map((f) => ({
          tipo: 'alojamiento' as const, id: String(f.shop_id), titulo: String(f.name),
          subtitulo: `${f.hotel} · hasta ${f.capacity} personas`, precioXaf: Number(f.base_price_xaf ?? 0),
          ciudad: f.city ? String(f.city) : null, fotoUrl: null,
        })),
      };
    }

    if (nombre === 'como_se_hace') {
      const tema = String(args?.tema ?? '').trim().toLowerCase();
      const g = GUIA.find((x) => x.clave === tema) ?? GUIA.find((x) => tema.includes(x.clave));
      if (!g) return { texto: `Temas disponibles: ${GUIA.map((x) => x.clave).join(', ')}. Elige uno.`, tarjetas: [] };
      return { texto: `${g.titulo}: ${g.texto}`, tarjetas: [] };
    }

    return { texto: `Herramienta desconocida: ${nombre}`, tarjetas: [] };
  }

  // ──────────────────────────────── EL CHAT ────────────────────────────────
  /**
   * Un turno de conversación: se guarda la pregunta, se llama al modelo (que puede usar las
   * herramientas), se guarda la respuesta con las tarjetas REALES que haya enseñado y se apunta el
   * gasto.
   */
  async chat(userId: string, dto: { message?: string; conversationId?: string | null; imageUrl?: string | null; productId?: string | null }) {
    if (!this.clave) {
      throw new DomainError('AI_NOT_CONFIGURED', 'El asistente todavía no está configurado: falta la clave del servicio de IA en el servidor');
    }
    const pregunta = String(dto?.message ?? '').trim().slice(0, MAX_LARGO_PREGUNTA);
    if (!pregunta) throw new DomainError('AI_MESSAGE_REQUIRED', 'Escribe una pregunta');

    const uso = await this.usoDeHoy(userId);
    if (uso.messages >= MAX_MENSAJES_DIA) {
      throw new DomainError('AI_LIMIT', `Has llegado al máximo de ${MAX_MENSAJES_DIA} mensajes al asistente por hoy. Mañana vuelve a estar disponible.`);
    }

    // Conversación: la que digan, o se abre una nueva.
    let convId = dto?.conversationId ? this.uuidOrNull(dto.conversationId) : null;
    if (convId) {
      const suya: any[] = await this.db.$queryRaw`
        SELECT id FROM lifebook.ai_conversations WHERE id = ${convId}::uuid AND user_id = ${userId}::uuid LIMIT 1`;
      if (!suya[0]) convId = null;
    }
    if (!convId) {
      const nueva: any[] = await this.db.$queryRaw`
        INSERT INTO lifebook.ai_conversations (user_id, title)
        VALUES (${userId}::uuid, ${pregunta.slice(0, 60)}) RETURNING id`;
      convId = nueva[0].id as string;
    }

    const imagenUrl = String(dto?.imageUrl ?? '').trim().slice(0, 8000000) || null;

    /**
     * UN PRODUCTO ADJUNTO (tanda N): tarjetas embebidas de productos guardados.
     *
     * La tarjeta se guarda en el MISMO mensaje del usuario, así que al reabrir el chat sigue ahí, y se
     * le cuenta al modelo con qué producto está hablando (sin eso, el asistente vería una tarjeta que
     * él no conoce y hablaría de memoria).
     */
    const productoId = dto?.productId ? this.uuidOrNull(dto.productId) : null;
    let tarjetaAdjunta: AiTarjeta | null = null;
    if (productoId) {
      const f: any[] = await this.db.$queryRaw`
        SELECT p.id, p.title, p.price_xaf, p.origin_city, p.media, s.name AS shop_name
          FROM lifebook.products p JOIN lifebook.shops s ON s.id = p.shop_id
         WHERE p.id = ${productoId}::uuid AND p.status = 'active' LIMIT 1`;
      if (f[0]) {
        tarjetaAdjunta = {
          tipo: 'producto', id: String(f[0].id), titulo: String(f[0].title),
          subtitulo: f[0].shop_name ? String(f[0].shop_name) : null,
          precioXaf: f[0].price_xaf === null ? null : Number(f[0].price_xaf),
          ciudad: f[0].origin_city ? String(f[0].origin_city) : null,
          fotoUrl: Array.isArray(f[0].media) && f[0].media[0]?.url ? String(f[0].media[0].url) : null,
        };
      }
    }
    await this.db.$executeRaw`
      INSERT INTO lifebook.ai_messages (conversation_id, role, content, payload)
      VALUES (${convId}::uuid, 'user', ${pregunta},
              ${JSON.stringify([
                ...(tarjetaAdjunta ? [tarjetaAdjunta] : []),
                ...(imagenUrl ? [{ tipo: 'foto', id: 'foto', titulo: 'Tu foto', subtitulo: null, precioXaf: null, ciudad: null, fotoUrl: imagenUrl }] : []),
              ])}::jsonb)`;

    // Contexto: los últimos mensajes de ESTA conversación (nunca de otras).
    const previos: any[] = await this.db.$queryRaw`
      SELECT role, content FROM lifebook.ai_messages
       WHERE conversation_id = ${convId}::uuid ORDER BY created_at DESC LIMIT ${MAX_HISTORIAL}`;
    /** Lo que ya se hablaba (estilo, talla, ciudad): lo tienen en cuenta la visión y el modelo. */
    const contexto = previos.slice(-4).reverse().map((m) => `${m.role}: ${String(m.content ?? '').slice(0, 140)}`).join(' | ');
    const historial: MensajeModelo[] = previos.reverse().map((m) => (
      { role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content ?? '') }
    ));

    const mensajes: MensajeModelo[] = [
      { role: 'system', content: this.promptSistema() },
      ...historial,
    ];

    let tarjetas: AiTarjeta[] = [];
    let tokens = 0;
    let textoFinal = '';

    /**
     * LA FOTO (tanda N).
     *
     * Si en este mensaje viene una foto, se le da al modelo una herramienta más: `ver_foto`. El modelo
     * de texto decide llamarla, la foto se mira con el modelo que VE (Qwen) y lo que ve vuelve como
     * resultado de herramienta — así puede después buscar en el catálogo con lo que ha reconocido.
     * La foto entra como URL pública o como `data:` (base64), que es lo que acepta el proveedor.
     */
    const herramientas = imagenUrl
      ? [...this.herramientas, {
        type: 'function' as const,
        function: {
          name: 'ver_foto',
          description: 'Mira la FOTO que ha mandado la persona y devuelve lo que se ve (objeto, prenda, color, texto, talla…). Úsala SIEMPRE que haya una foto, antes de contestar.',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      }]
      : this.herramientas;

    /**
     * Y SE LE DICE QUE HAY FOTO. Sin esto el modelo no llamaba a `ver_foto`: medido, contestaba «No me
     * ha llegado ninguna foto» aunque la foto venía en la petición. El modelo de texto no «ve» el
     * archivo por sí solo; hay que decirle que existe y que la mire con la herramienta.
     */
    if (imagenUrl) {
      mensajes.push({
        role: 'system',
        content: 'La persona ha ADJUNTADO UNA FOTO en este mensaje. Llama a ver_foto para mirarla ANTES de contestar y basa tu respuesta en lo que se ve.',
      });
    }
    if (tarjetaAdjunta) {
      mensajes.push({
        role: 'system',
        content: `La persona ha adjuntado ESTE producto del catálogo: «${tarjetaAdjunta.titulo}» (id=${tarjetaAdjunta.id}, ${tarjetaAdjunta.precioXaf ?? 'precio a consultar'} XAF, ${tarjetaAdjunta.ciudad ?? 'sin ciudad'}, tienda ${tarjetaAdjunta.subtitulo ?? '—'}). Habla de ÉL (puedes usar ver_producto con ese id) y no le preguntes cuál es.`,
      });
    }

    for (let ronda = 0; ronda < MAX_RONDAS_HERRAMIENTAS; ronda += 1) {
      const respuesta = await this.llamarModelo(mensajes, herramientas);
      tokens += Number(respuesta?.usage?.total_tokens ?? 0);
      const eleccion = respuesta?.choices?.[0]?.message;
      if (!eleccion) throw new DomainError('AI_FAILED', 'El asistente no respondió. Inténtalo otra vez.');

      const llamadas = Array.isArray(eleccion.tool_calls) ? eleccion.tool_calls : [];
      if (!llamadas.length) {
        textoFinal = String(eleccion.content ?? '').trim();
        break;
      }
      mensajes.push({ role: 'assistant', content: eleccion.content ?? null, tool_calls: llamadas });
      for (const l of llamadas) {
        let args: any = {};
        try { args = JSON.parse(l.function?.arguments ?? '{}'); } catch { args = {}; }
        /**
         * SI UNA HERRAMIENTA FALLA, LA CONVERSACIÓN NO SE ROMPE.
         *
         * Medido: una consulta sin permiso en la base (`permission denied for table intercity_routes`)
         * lanzaba una excepción y el chat entero devolvía un 500. Ahora el fallo se le cuenta AL
         * MODELO —«esa consulta no está disponible»— para que siga respondiendo con lo que sí sabe, y
         * el error queda en el registro. El usuario nunca ve un 500 por una herramienta.
         */
        let r: { texto: string; tarjetas: AiTarjeta[] };
        try {
          // `ver_foto` no consulta la base: mira la foto con el modelo que ve (Qwen).
          if (String(l.function?.name) === 'ver_foto') {
            const visto = imagenUrl
              ? await this.mirarFoto(imagenUrl, pregunta, contexto)
              : 'No hay ninguna foto en este mensaje. Dilo tal cual.';
            r = { texto: `Lo que se ve en la foto: ${visto}`, tarjetas: [] };
          } else {
            r = await this.ejecutar(String(l.function?.name ?? ''), args);
          }
          /**
           * SE DEJA RASTRO DE CADA CONSULTA. Sin esto es imposible saber si el asistente dijo «no hay
           * nada» porque la base no tiene nada o porque la herramienta no se llamó bien: medido, dijo
           * «no hay habitaciones en Malabo» habiendo ocho. El registro es la única forma de
           * distinguir «no hay» de «no lo busqué».
           */
          this.log.log(`↳ ${l.function?.name}(${JSON.stringify(args)}) → ${r.tarjetas.length} tarjeta(s)`);
        } catch (e) {
          this.log.error(`Herramienta ${l.function?.name} falló: ${e instanceof Error ? e.message : e}`);
          // Si la consulta falla, se buscan alternativas REALES en vez de dejar la conversación muerta.
            // El modelo recibe los datos, no la excusa: «ese modelo exacto no está, pero estos sí».
            const alt = await this.ejecutar('buscar_productos', { texto: '', ciudad: '' }).catch(() => ({ texto: '', tarjetas: [] as AiTarjeta[] }));
            r = {
              texto: `La consulta exacta no salió. NO menciones fallos técnicos: ofrece ESTAS alternativas reales del catálogo como lo más parecido que hay:\n${alt.texto}`,
              tarjetas: alt.tarjetas,
            };
        }
        tarjetas = [...tarjetas, ...r.tarjetas];
        mensajes.push({ role: 'tool', tool_call_id: l.id, name: String(l.function?.name ?? ''), content: r.texto });
      }
    }

    if (!textoFinal) textoFinal = 'No he podido terminar la respuesta. ¿Lo intentas otra vez?';

    // Las tarjetas que se enseñan: sin repetir y como mucho 6.
    const vistas = new Set<string>();
    const unicas = tarjetas.filter((t) => (vistas.has(`${t.tipo}:${t.id}`) ? false : (vistas.add(`${t.tipo}:${t.id}`), true))).slice(0, 6);

    await this.db.$executeRaw`
      INSERT INTO lifebook.ai_messages (conversation_id, role, content, payload)
      VALUES (${convId}::uuid, 'assistant', ${textoFinal}, ${JSON.stringify(unicas)}::jsonb)`;
    await this.db.$executeRaw`
      UPDATE lifebook.ai_conversations SET updated_at = now() WHERE id = ${convId}::uuid`;
    await this.db.$executeRaw`
      INSERT INTO lifebook.ai_usage (user_id, day, messages, tokens)
      VALUES (${userId}::uuid, (now() AT TIME ZONE 'UTC')::date, 1, ${tokens})
      ON CONFLICT (user_id, day) DO UPDATE SET
        messages = lifebook.ai_usage.messages + 1,
        tokens = lifebook.ai_usage.tokens + ${tokens},
        updated_at = now()`;

    return {
      conversationId: convId,
      reply: { text: textoFinal, cards: unicas },
      leftToday: Math.max(0, MAX_MENSAJES_DIA - (uso.messages + 1)),
    };
  }

  /**
   * EL PROMPT. Aquí están las reglas de honestidad y lo que el asistente NO puede hacer.
   */
  private promptSistema(): string {
    return [
      'Eres CUCUCUL, el ASESOR DE COMPRAS de la app EG Route Plan (Guinea Ecuatorial): no eres un buscador de inventario, eres un personal shopper. Ayudas con TODOS los servicios: Life Book (mercado, tienda, productos, tallas, cupones, alojamiento), taxi y viajes entre ciudades, comida a domicilio, alquiler, trabajo, documentos y emergencia, mensajes y grupos, y la cuenta.',
      'PIENSAS EN LOOKS Y EN COMBOS. Si mencionan un ESTILO (blokecore, retro, y2k, old money, streetwear, formal, deportivo, playa, oficina…) o un uso («algo para una boda»), traduce ese estilo a 2-4 CATEGORÍAS de producto y búscalas por separado con buscar_productos (blokecore → zapatillas retro, jeans rectos, jersey o sudadera). Después propone el look con lo que HAYA de verdad, con sus precios, y ofrece armarlo: «¿Te armo el combo?».',
      'Si del estilo pedido no hay nada, dilo y ofrece la alternativa más cercana que sí exista (mismo uso, otro estilo o parecido de precio).',
      'NUNCA contestes que algo no existe sin haber llamado ANTES a buscar_productos. Si de verdad no hay, di que no hay y ofrece 2-3 alternativas REALES del catálogo (mismo uso o parecido de precio): nunca cierres la conversación con un «no hay».',
      'IDIOMA: contesta SIEMPRE en el idioma del ÚLTIMO mensaje de la persona (chino, español, francés, inglés o portugués), con la misma naturalidad y la misma chispa consultiva. Si mezcla idiomas, usa el del mensaje más reciente.',
      'SI EL MENSAJE TRAE CARACTERES CHINOS, CONTESTAS EN CHINO. Sin excepciones: ni una frase en español. Lo mismo con el francés, el inglés y el portugués: se contesta en el idioma en el que te escriben, aunque el resto de la conversación sea en otro.',
      'MEMORIA CORTA: mantén el contexto ya hablado (un estilo, una talla, una ciudad, un presupuesto). Si antes hablasteis de un estilo, TODO lo que llegue después —una foto, una pregunta suelta— se evalúa bajo ese paraguas, no como una búsqueda aislada.',
      'REGLAS QUE NO SE ROMPEN:',
      '1. Solo hablas de productos y tiendas que te devuelvan tus herramientas. NUNCA inventes productos, precios, existencias ni plazos de entrega. Si la búsqueda no devuelve nada, di que no hay nada.',
      '2. No tienes acceso a datos personales de nadie (teléfonos, correos, direcciones, medidas, pedidos de otras personas). Si te los piden, di que no puedes.',
      '3. No prometes nada que no esté en la información que te dan las herramientas: ni envíos, ni fechas, ni descuentos.',
      '4. Para «¿cómo se hace…?» usa la herramienta como_se_hace y explícalo con esas palabras.',
      '5. Responde CORTO y útil: 1-3 frases. Nada de listas largas ni de repetir lo que ya se ve en las tarjetas.',
      '6. Nunca pidas datos personales ni sugieras pagar fuera de la app.',
      '7. Si la persona pregunta por comida, alquiler, trabajo, viajes o habitaciones, USA la herramienta que corresponda antes de contestar: no hables de memoria.',
      '8. BUSCA ANTES DE PREGUNTAR. Si la pregunta es vaga («¿qué comida hay?»), llama igualmente a la herramienta SIN filtros, enseña lo que haya y luego, si hace falta, pregunta la ciudad. Está prohibido responder solo con una pregunta sin haber buscado antes.',
      `Los temas de ayuda disponibles son: ${GUIA.map((g) => g.clave).join(', ')}.`,
    ].join('\n');
  }

  /** La llamada al proveedor (OpenAI-compatible: sirve para DeepSeek y para otros). */
  private async llamarModelo(mensajes: MensajeModelo[], herramientas: any[]): Promise<any> {
    const url = `${this.baseUrl}/chat/completions`;
    let r: Response;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.clave}` },
        body: JSON.stringify({
          model: this.modelo,
          messages: mensajes,
          tools: herramientas,
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: MAX_TOKENS_RESPUESTA,
        }),
      });
    } catch (e) {
      this.log.error(`No se pudo llamar al modelo: ${e instanceof Error ? e.message : e}`);
      throw new DomainError('AI_UNREACHABLE', 'No se pudo contactar con el servicio de IA. Inténtalo otra vez.');
    }
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => '');
      this.log.error(`El modelo respondió ${r.status}: ${cuerpo.slice(0, 300)}`);
      if (r.status === 401 || r.status === 403) {
        throw new DomainError('AI_NOT_CONFIGURED', 'La clave del servicio de IA no es válida. Avisa al administrador.');
      }
      throw new DomainError('AI_FAILED', 'El asistente no pudo responder ahora mismo. Inténtalo otra vez.');
    }
    return r.json();
  }

  // ─────────────────── ME GUSTA, HISTORIAL Y CONSEJOS (tanda N) ──────────────
  /**
   * EDITAR UN MENSAJE MÍO.
   *
   * Solo los mensajes **del usuario**: una respuesta del asistente no se edita (sería falsear lo que
   * dijo; si no gustó, se borra o se pide otra). Al editarlo cambia también lo que el modelo verá en
   * el contexto, porque el contexto se lee de aquí.
   */
  async editarMensaje(userId: string, messageId: string, texto: string) {
    const mid = this.uuidOrNull(messageId);
    if (!mid) throw new DomainError('AI_MESSAGE_NOT_FOUND', 'Ese mensaje no existe');
    const limpio = String(texto ?? '').trim().slice(0, MAX_LARGO_PREGUNTA);
    if (!limpio) throw new DomainError('AI_MESSAGE_REQUIRED', 'El mensaje no puede quedar vacío');
    const filas: any[] = await this.db.$queryRaw`
      UPDATE lifebook.ai_messages m SET content = ${limpio}
        FROM lifebook.ai_conversations c
       WHERE m.id = ${mid}::uuid AND m.conversation_id = c.id AND c.user_id = ${userId}::uuid
         AND m.role = 'user'
       RETURNING m.id, m.content`;
    if (!filas[0]) throw new DomainError('AI_MESSAGE_NOT_FOUND', 'Ese mensaje no existe o no es tuyo');
    return { id: filas[0].id, text: filas[0].content };
  }

  /** BORRAR UN MENSAJE MÍO (desaparece también del contexto: el asistente no lo «recordará»). */
  async borrarMensaje(userId: string, messageId: string) {
    const mid = this.uuidOrNull(messageId);
    if (!mid) throw new DomainError('AI_MESSAGE_NOT_FOUND', 'Ese mensaje no existe');
    const borrados: number = await this.db.$executeRaw`
      DELETE FROM lifebook.ai_messages m
       USING lifebook.ai_conversations c
       WHERE m.id = ${mid}::uuid AND m.conversation_id = c.id AND c.user_id = ${userId}::uuid
         AND m.role = 'user'`;
    if (!borrados) throw new DomainError('AI_MESSAGE_NOT_FOUND', 'Ese mensaje no existe o no es tuyo');
    return { ok: true, deleted: Number(borrados) };
  }

  /**
   * «ME GUSTA» A UNA RESPUESTA DEL ASISTENTE.
   *
   * Es una señal PRIVADA: no hay contador público en el chat. Solo el dueño de la conversación puede
   * marcarla (la comprobación va por `user_id`, no por el id del mensaje: un id ajeno no vale).
   */
  async megusta(userId: string, messageId: string, liked: boolean) {
    const mid = this.uuidOrNull(messageId);
    if (!mid) throw new DomainError('AI_MESSAGE_NOT_FOUND', 'Ese mensaje no existe');
    const filas: any[] = await this.db.$queryRaw`
      UPDATE lifebook.ai_messages m SET liked = ${!!liked}
        FROM lifebook.ai_conversations c
       WHERE m.id = ${mid}::uuid AND m.conversation_id = c.id AND c.user_id = ${userId}::uuid
         AND m.role = 'assistant'
       RETURNING m.id, m.liked`;
    if (!filas[0]) throw new DomainError('AI_MESSAGE_NOT_FOUND', 'Ese mensaje no existe o no es de una respuesta tuya');
    return { id: filas[0].id, liked: !!filas[0].liked };
  }

  /** EL HISTORIAL: todas mis conversaciones, la última primero. */
  async conversaciones(userId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT c.id, c.title, c.updated_at,
             (SELECT count(*)::int FROM lifebook.ai_messages m WHERE m.conversation_id = c.id) AS mensajes,
             (SELECT m.content FROM lifebook.ai_messages m
               WHERE m.conversation_id = c.id AND m.role = 'user'
               ORDER BY m.created_at ASC LIMIT 1) AS primera_pregunta
        FROM lifebook.ai_conversations c
       WHERE c.user_id = ${userId}::uuid
       ORDER BY c.updated_at DESC
       LIMIT 50`;
    return {
      conversations: filas.map((c) => ({
        id: c.id,
        title: c.title ?? c.primera_pregunta ?? 'Conversación',
        messages: Number(c.mensajes ?? 0),
        updatedAt: c.updated_at,
      })),
    };
  }

  /** Borrar una conversación mía (con sus mensajes). */
  async borrarConversacion(userId: string, conversationId: string) {
    const cid = this.uuidOrNull(conversationId);
    if (!cid) throw new DomainError('AI_CONVERSATION_NOT_FOUND', 'Esa conversación no existe');
    const borradas: number = await this.db.$executeRaw`
      DELETE FROM lifebook.ai_conversations WHERE id = ${cid}::uuid AND user_id = ${userId}::uuid`;
    if (!borradas) throw new DomainError('AI_CONVERSATION_NOT_FOUND', 'Esa conversación no existe o no es tuya');
    return { ok: true, deleted: Number(borradas) };
  }

  /**
   * CONSEJOS PARA MEJORAR EL ASISTENTE.
   *
   * Lo que la gente escriba se guarda tal cual (con su tipo: mejora, fallo o elogio) para poder
   * mejorar de verdad el asistente con lo que dicen los que lo usan.
   */
  async consejo(userId: string, dto: { kind?: string; text?: string; messageId?: string | null }) {
    const kind = ['mejora', 'fallo', 'elogio'].includes(String(dto?.kind ?? '')) ? String(dto.kind) : 'mejora';
    const texto = String(dto?.text ?? '').trim().slice(0, 1000);
    if (texto.length < 3) throw new DomainError('AI_FEEDBACK_REQUIRED', 'Escribe tu consejo');
    const mid = dto?.messageId ? this.uuidOrNull(dto.messageId) : null;
    await this.db.$executeRaw`
      INSERT INTO lifebook.ai_feedback (user_id, message_id, kind, text)
      VALUES (${userId}::uuid, ${mid}::uuid, ${kind}, ${texto})`;
    return { ok: true, kind };
  }
}
