/**
 * Cliente del servicio Ecomerse (marketplace estilo Xianyu) — backend unificado.
 * Base ABSOLUTA: /api/ecomerse/*. F1: catálogo público + vendedor con requisitos
 * (KYC + datos negocio + aprobación admin) + productos moderados + pedidos
 * cash|billing + garantía 7d + disputas + reviews.
 */

import { http, httpRequest } from './httpClient';

import { API_HOST } from './config';
export const ECOMERSE_API = `${API_HOST}/api`;
const e = (p: string) => `${ECOMERSE_API}${p}`;

export interface EcomerseSubcategory { id: string; code: string; label: string; }

/** Nivel 3 del árbol: la HOJA. Es donde vive un anuncio, y no lleva icono. */
export interface EcomerseLeaf { id: string; code: string; label: string; }

/**
 * Nivel 2: la FAMILIA. Es lo que el árbol viejo llamaba «categoría», y lo que elige una tienda.
 *
 * `foto` ES LA IMAGEN DE LA CELDA de la home (23-sep-2026), y **no es un dato de la familia**: la
 * familia no tiene imagen propia —`icon` viene nulo en las 110—, así que el servidor la **resuelve**
 * a partir de una TIENDA de esa familia (su logo, o si no lo tiene la foto de su anuncio más
 * reciente; sin nada, `null`). Consecuencia que hay que tener clara antes de tocar esto: el mismo
 * día que las tiendas cambien sus fotos —o que se borren las de prueba— la celda se actualiza sola
 * y **el rótulo no se mueve**, porque el rótulo sale del árbol y la imagen de las tiendas. `null` es
 * un estado legítimo: la app pinta la celda con su nombre y sin imagen.
 */
export interface EcomerseFamily {
  id: string; code: string; label: string; icon: string | null;
  foto: string | null;
  hojas: EcomerseLeaf[];
}

/**
 * Nivel 1: el DEPARTAMENTO. Es el bloque con el que se abre el Mercado (18 en total).
 *
 * `subs` SIGUE AQUÍ y no es un resto: el servidor manda además la lista de familias SIN sus hojas
 * con el nombre viejo, para que una pantalla que aún no conozca los tres niveles siga pintando su
 * selector de dos pasos con las mismas etiquetas. Si vas a escribir código nuevo, usa `familias`.
 */
export interface EcomerseDepartment {
  id: string; code: string; label: string; icon: string | null;
  familias: EcomerseFamily[];
  subs: EcomerseSubcategory[];
}

/** El nivel 1, con su nombre nuevo. El alias se conserva para no tocar las pantallas que ya lo usan. */
export type EcomerseCategory = EcomerseDepartment;

export interface EcomerseSellerBrief {
  id: string | null; businessName: string | null; ratingAvg: number; ratingCount: number;
  city: string | null; phoneContact: string | null; photoKey: string | null; userId: string | null;
  /** 'Pro' si la tienda tiene Tienda Pro activa (badge en tarjetas). */
  badge?: string | null;
  /** Identidad verificada (KYC aprobado) — el escudo solo si es real. */
  verified?: boolean;
}

/**
 * Una tienda del CENSO (`GET /ecomerse/sellers`).
 *
 * POR QUÉ EXTIENDE DEL BRIEF: la app pinta la tarjeta de una tienda con **un solo componente**
 * (`components/ecomerse/CabeceraTienda.tsx`) en los tres sitios donde aparece —directorio, página de
 * tienda y ficha de un anuncio—. Ahí dentro se leen `businessName`, `ratingAvg`, `ratingCount`,
 * `city`, `phoneContact`, `photoKey`, `badge` y `verified`, que es exactamente el brief que viaja
 * dentro de cada anuncio. Si el censo devolviera otra forma, la tarjeta del directorio saldría con
 * «Vendedor» de nombre y «—» de ciudad mientras la de la ficha sale bien, y nadie lo notaría hasta
 * ver las dos pantallas juntas. Extender el brief no es un atajo: es lo que impide esa deriva.
 *
 * `id` se re-declara como `string` (en el brief es `string | null`): una tienda del censo **siempre**
 * tiene id —es la clave por la que se la ha pedido— y con `string | null` cada `keyExtractor` y cada
 * navegación necesitarían un `?? ''` que taparía el problema en vez de resolverlo.
 *
 * Los tres campos de más son los que **solo** se saben mirando la tienda entera, no un anuncio:
 * cuántos anuncios activos tiene, su categoría y su descripción.
 */
export interface EcomerseSellerCard extends Omit<EcomerseSellerBrief, 'id'> {
  id: string;
  /** Anuncios ACTIVOS de la tienda, contados por el servidor. */
  anuncios: number;
  /** La tienda solo llega a familia: no publica un artículo suelto, así que no tiene hoja. */
  departmentLabel?: string | null;
  familyLabel?: string | null;
  /** Compatibilidad: `categoryLabel` es la FAMILIA (ver `EcomerseProduct`). */
  categoryLabel?: string | null;
  categoryIcon?: string | null;
  description?: string | null;
  createdAt?: string | null;
}

/**
 * La respuesta del censo. Es un objeto y no un array **a propósito**, y esa decisión viene de la
 * pantalla: con un array, «hay 250 tiendas y te doy 60» no se puede decir sin que el cliente cuente
 * lo que recibió y lo confunda con el total. `total` y `anuncios` los cuenta el servidor sobre todo
 * lo que casa con el filtro; `sellers` es la página.
 */
export interface EcomerseSellersResponse {
  total: number;
  anuncios: number;
  sellers: EcomerseSellerCard[];
}

/**
 * Una tienda QUE SE SIGUE (`GET /ecomerse/sellers/following`).
 *
 * EXTENDE LA TARJETA DEL CENSO, no la reinventa: la pantalla de «tiendas que sigo» pinta cada fila
 * con el mismo `CabeceraTienda` que el directorio, y si esta forma se desviara del censo —mismo
 * nombre distinto, otra ciudad— la comparación de las dos pantallas sería la única forma de verlo.
 * El único campo de más es `since`, y es del SEGUIMIENTO, no de la tienda: por eso vive aquí y no
 * en `EcomerseSellerCard` (que también pinta el censo, donde «desde cuándo la sigues» no significa
 * nada).
 */
export interface EcomerseTiendaSeguida extends EcomerseSellerCard {
  /** Desde cuándo se sigue (`created_at` de la fila del seguimiento). */
  since: string | null;
}

/** Documentación que el vendedor aporta por un anuncio (tanda 4 · sección 4 del formulario). */
export interface EcomerseProductDoc {
  id: string;
  docType: 'factura_compra' | 'certificado_autenticidad' | 'autorizacion_marca';
  url: string;
  docNumber: string | null;
  amountXaf: number | null;
  issuedOn: string | null;
  /** `pending` hasta que un admin la revise: el comprador la ve con su estado, no como un sello. */
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  createdAt: string;
}

/** Documento pendiente de revisión, con su anuncio: quien revisa necesita saber QUÉ está revisando. */
export interface EcomerseDocPendiente extends EcomerseProductDoc {
  producto: { id: string; title: string; priceXaf: number; city: string; sellerName: string | null };
}

/**
 * ── LAS COMBINACIONES DEL ANUNCIO (fase 4 del comerciante, 21-sep-2026) ─────────────────────────
 *
 * Lo que el comprador elige antes de comprar: Color, Talla, Almacenamiento, Formato… El Mercado no
 * tenía nada de esto: el formulario del vendedor pedía «talla» y «color» como **texto libre** y los
 * guardaba en `attributes`, donde no los leía nadie, y los botones compraban el anuncio entero.
 *
 * Los dos mercados comparten las **reglas** (módulo `opciones-producto.ts` del servidor), así que la
 * forma que llega aquí es **la misma** que en Life Book (`api/commerce.ts`). Eso es deliberado: una
 * sola forma de los ejes en toda la app, y las dos fichas pueden portarse la una a la otra.
 *
 * Dos invariantes que el servidor impone y que aquí se ven como datos, no como validación:
 *   · En un eje de **color**, cada valor lleva **su foto real del producto** (`imageUrl`). No vale un
 *     cuadradito con el color: el servidor rechaza un color sin foto y una foto que no sea de ese
 *     anuncio.
 *   · **Toda combinación tiene un valor para cada eje**, y no hay dos iguales.
 */
export type EcomerseOptionKind = 'color' | 'size' | 'text';

export interface EcomerseOptionValue {
  value: string;
  label?: string | null;
  /** La foto del producto EN ESE COLOR. Solo en los ejes de color (el servidor lo exige). */
  imageUrl?: string | null;
  /** El color de relleno, cuando el vendedor lo declara. La app prefiere la foto. */
  hex?: string | null;
}

export interface EcomerseOptionGroup {
  id?: string;
  /** Identidad del eje: es la clave con la que las combinaciones guardan su valor. */
  code: string;
  label: string;
  kind: EcomerseOptionKind;
  values: EcomerseOptionValue[];
}

export interface EcomerseProductVariant {
  id?: string;
  /** «Rojo · M» — lo que se enseña en el carrito y se congela en la línea del pedido. */
  name: string;
  /** `null` = hereda el precio del anuncio. Si es distinto, manda este. */
  priceXaf: number | null;
  /** El stock REAL de esta combinación: es el que limita la cantidad. */
  stockQuantity: number;
  sku?: string | null;
  imageUrl?: string | null;
  weightG?: number | null;
  /** `{ color: 'Rojo', talla: 'M' }` — la identidad de la combinación. */
  attributes?: Record<string, string | number | boolean>;
}

export interface EcomerseProduct {
  id: string; title: string; description: string | null;
  /**
   * EL ÁRBOL, con sus tres niveles dichos por su nombre: departamento · familia · hoja.
   *
   * `categoryId` / `subcategoryId` / `categoryLabel` SE MANTIENEN, y significan lo de siempre: en el
   * árbol viejo eran «el nivel de arriba» y «el de abajo», y de las 21 categorías viejas salieron
   * las FAMILIAS y de las 134 subcategorías las HOJAS. Así que `categoryId` es la familia y
   * `subcategoryId` la hoja. El servidor los rellena solo; una pantalla sin actualizar sigue
   * filtrando y pintando algo cierto.
   */
  departmentId: string | null; departmentLabel: string | null; departmentIcon: string | null;
  familyId: string | null; familyLabel: string | null;
  leafId: string | null; leafLabel: string | null;
  categoryId: string | null; categoryLabel: string | null; categoryIcon: string | null;
  subcategoryId: string | null; subcategoryLabel: string | null;
  priceXaf: number; city: string; photos: string[]; stock: number;
  status: string; rejectionReason: string | null; isNegotiable: boolean; views: number;
  favoriteCount: number; isFeatured: boolean; featuredUntil: string | null;
  /** Atributos del producto (talla, color, estado, marca…) */
  attributes: Record<string, string | number | boolean>;
  /** Horas de preparación que declara el vendedor (24/48/72). Tanda 4. */
  handlingHours: number;
  /** Devoluciones que ofrece el vendedor; NO es la garantía de 7 días de la plataforma. Tanda 4. */
  returnsAccepted: boolean;
  createdAt: string; updatedAt: string; seller: EcomerseSellerBrief;
  /** Solo en favoritos (myFavorites): true si está marcado como 特别关注. */
  isSpecial?: boolean;
  /**
   * ── LAS COMBINACIONES (fase 4) ────────────────────────────────────────────────────────────────
   *
   * `options` y `variants` llegan en la **ficha** (`product(id)`), que es donde se eligen.
   * Ausentes o vacíos = el anuncio se compra entero, que es como funcionaba todo hasta la fase 4
   * (y como siguen funcionando los anuncios sin ejes). Quien los pinte tiene que tratar ese caso
   * como el normal, no como una avería.
   *
   * `variantCount` es el recuento, para quien **no** tiene la ficha delante: lo manda `myProducts`
   * (la zona del comerciante) — y la tarjeta lo usa para no meter en el carrito un anuncio que
   * exige elegir. **El catálogo todavía no lo manda**: mientras no lo haga, la guarda de la tarjeta
   * está escrita pero no se activa (ver `app/ecomerse.tsx`, `onAdd`).
   */
  options?: EcomerseOptionGroup[];
  variants?: EcomerseProductVariant[];
  variantCount?: number;
  /** Solo en la ficha (`product`): documentación aportada por el vendedor. Tanda 4. */
  docs?: EcomerseProductDoc[];
}

export interface EcomerseShopPlan {
  limit: number; badge: boolean; priority: boolean; plan: string; name: string;
  used: number; freeFeaturedLeft: number; freeFeaturedMax: number;
  /** Vencimiento del plan de pago activo (para mostrar "activo hasta…"). */
  expiresAt?: string | null;
}

export interface EcomerseDeliveryZone {
  id: string; city: string; zoneCode: string; label: string;
  baseFeeXaf: number; perKmXaf: number; kmDefault: number;
}

/**
 * Una dirección de la agenda del comprador (Fase 2 del pie del Mercado).
 *
 * `zoneLabel` viene ya resuelto por el servidor: es el rótulo de su zona de reparto («Zona céntrica
 * (Malabo I/II, Plaza)»). Se pinta tal cual en la lista, sin tener que cruzar con `deliveryZones`.
 */
export interface EcomerseAddress {
  id: string;
  recipient: string;
  phone: string;
  city: string;
  zoneId: string | null;
  zoneLabel: string | null;
  detail: string;
  landmark: string | null;
  label: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lo que viaja al crear o editar. `isDefault` NO se usa al marcar la predeterminada: eso tiene su
 * propia ruta (`setDefaultAddress`), que es idempotente y no exige tener la dirección entera a mano.
 */
export interface EcomerseAddressInput {
  recipient: string;
  phone: string;
  city: string;
  zoneId?: string | null;
  detail: string;
  landmark?: string | null;
  label?: string | null;
  isDefault?: boolean;
}

/** Lo que devuelve borrar: a quién le pasó el testigo de predeterminada, si le pasó a alguien. */
export interface EcomerseAddressBorrada {
  ok: true;
  deletedId: string;
  nuevaDefault: string | null;
}

export interface EcomerseSellerMe {
  kycOk: boolean; kycMessage: string | null; warrantyDays: number;
  seller: null | {
    id: string; businessName: string;
    departmentId: string | null; departmentLabel: string | null; departmentIcon: string | null;
    familyId: string | null; familyLabel: string | null;
    /** Compatibilidad: `categoryId` es la FAMILIA. */
    categoryId: string | null; categoryLabel: string | null;
    description: string | null; city: string; phoneContact: string | null; photoKey: string | null;
    status: string; rejectionReason: string | null; ratingAvg: number; ratingCount: number;
    approvedAt: string | null; createdAt: string;
  };
  products: EcomerseProduct[];
}

export interface EcomerseOrder {
  id: string; buyerId: string; sellerId: string; sellerName: string | null; sellerPhone: string | null;
  items: Array<{
    productId: string; title: string; price: number; qty: number; photos: string[];
    /**
     * La COMBINACIÓN comprada (fase 4), congelada con el pedido: `variantId`, su nombre ya compuesto
     * («Rojo · M») y la foto del color elegido. El servidor los manda en la misma respuesta
     * (`ecomerse.service.ts`, el `line` de la compra) y no cambian aunque el anuncio después cambie
     * de combinaciones o de foto — es la misma congelación que la del título y el precio.
     *
     * Van declarados aquí porque sin ellos la app no podía pintarlos: el pedido enseñaba «Camisa» y
     * el comprador no sabía qué eligió, ni el vendedor qué tenía que servir.
     */
    variantId?: string | null;
    variantName?: string | null;
    variantAttributes?: Record<string, string | number> | null;
    variantImageUrl?: string | null;
  }>;
  totalXaf: number; logisticsFeeXaf: number; paymentMethod: string; billingOrderId: string | null;
  deliveryZoneId: string | null; deliveryZone: string | null; deliveryKm: number | null;
  status: string; deliveryAddress: string | null; note: string | null;
  deliveredAt: string | null; warrantyExpiresAt: string | null; openDisputes: number; reviewed: boolean;
  fulfillmentType: string; cancelledAt: string | null; cancellationReason: string | null; createdAt: string;
  /** Embebidos por myOrders (v4.9): auditoría y envío, sin N+1. */
  events?: EcomerseOrderEvent[];
  shipment?: EcomerseShipment | null;
}

export interface EcomerseOrderEvent {
  id: string; fromStatus: string | null; toStatus: string; actorType: string;
  actorId: string | null; note: string | null; createdAt: string;
}

export interface EcomerseShipment {
  id: string; orderId: string; fulfillmentType: string; agentId: string | null;
  agentName: string | null; trackingCode: string; status: string; createdAt: string; updatedAt: string;
}

/**
 * Los DOS CANALES del sistema (Fase 3 del pie del Mercado, 22-sep-2026).
 *
 * `transaction` son los hechos comerciales —el pedido nace, la tienda acepta, se cancela, se abre o
 * se cierra una disputa— y `logistics` es el viaje del paquete —el agente asignado, cuándo sale,
 * cuándo llega—. La separación no es cosmética: son dos preguntas distintas («¿qué ha pasado con mi
 * dinero?» y «¿dónde está mi paquete?») y en la bandeja del comprador van en dos filas.
 */
export type EcomerseNoticeChannel = 'transaction' | 'logistics';

/**
 * LA LÍNEA CONGELADA de un pedido: qué se compró, a qué precio y con qué combinación.
 *
 * POR QUÉ VIAJA CON UN AVISO O CON UNA RECLAMACIÓN: ni la bandeja de avisos ni la de reclamaciones
 * pintan párrafos — pintan **la tarjeta del artículo** (foto, título y precio), que es lo que dice de
 * un vistazo de qué compra se está hablando. Los cuatro datos están congelados en el `items` del
 * pedido (NO se leen del anuncio de hoy, que puede haber cambiado de precio o de foto), y el servidor
 * los devuelve ya resueltos: si no, la pantalla tendría que cruzar cien filas con sus pedidos para
 * sacar un título y un precio.
 *
 * ES UN TIPO COMPARTIDO A PROPÓSITO (se llamaba `EcomerseNoticeProduct` hasta la Fase 5, cuando la
 * lista de reclamaciones necesitó exactamente lo mismo): el dato es «la línea tal como se compró», no
 * «el artículo de un aviso». Dos tipos idénticos con nombres distintos se separarían al primer cambio
 * —uno ganaría un campo y el otro no— y entonces las dos pantallas pintarían cosas diferentes sin que
 * nadie lo hubiera decidido.
 */
export interface EcomerseArticuloPedido {
  title: string;
  priceXaf: number;
  qty: number;
  photoUrl: string | null;
  variantName: string | null;
}

/**
 * Un aviso. `read` llega ya RESUELTO por el servidor (`read_at IS NULL`), así que la pantalla no
 * tiene que interpretar una fecha nula para decidir si pinta el punto de «sin leer».
 */
export interface EcomerseNotice {
  id: string; orderId: string | null;
  /** La referencia corta del pedido («94E70807»), la misma que aparece en el texto del aviso. */
  orderRef: string | null;
  channel: EcomerseNoticeChannel;
  code: string; title: string; body: string | null;
  read: boolean; readAt: string | null; createdAt: string;
  /**
   * El artículo del pedido, o `null` si el aviso no tiene pedido detrás o el pedido no guardó
   * líneas. La pantalla sabe pintar la fila sin tarjeta —con el cuerpo del aviso—, y eso es mejor
   * que una tarjeta con datos inventados.
   */
  product: EcomerseArticuloPedido | null;
}

/**
 * Los no leídos de cada canal. Los DOS canales vienen siempre, aunque uno esté a cero: la bandeja
 * pinta dos filas fijas, y un canal ausente obligaría al cliente a inventarse el que falta —que es
 * como se acaba pintando un «0» que no ha dicho nadie.
 */
export interface EcomerseNoticeCounts {
  channels: Record<EcomerseNoticeChannel, { unread: number; total: number }>;
  unread: number;
  total: number;
}

/**
 * LA TIENDA, vista desde un chat del Mercado (Fase 4 del pie).
 *
 * NO es el brief de `/ecomerse/sellers/:id` y no se puede pasar por él: aquí sólo está lo que se
 * pinta junto a un mensaje —nombre, logo, ciudad y valoración—, y falta a propósito lo que allí sí
 * tiene sentido (el `userId`, el teléfono, la clave de la foto, la rama del árbol). Si se usara el
 * mismo tipo, un cambio en la ficha rompería una cabecera de chat sin avisar.
 *
 * `photoUrl` VIENE RESUELTA POR EL SERVIDOR, y ese es medio motivo de que este tipo exista: la
 * `photo_key` de una tienda es una CLAVE del almacenamiento, no una URL, y la app no tiene con qué
 * convertirla —de ahí que `CabeceraTienda` pinte hoy una inicial—. Aquí llega ya la URL pública, y
 * `null` cuando la tienda no tiene logo. Ese `null` es un caso de verdad, no un fallo: se pinta la
 * inicial y ya.
 */
export interface EcomerseChatSeller {
  id: string;
  businessName: string | null;
  photoUrl: string | null;
  city: string | null;
  ratingAvg: number;
  ratingCount: number;
  verified: boolean;
  /**
   * El teléfono de contacto de la tienda, para el escape a WhatsApp.
   *
   * ESTÁ AQUÍ POR LA DECISIÓN 5.b DE LA FASE: el chat convive con WhatsApp, no lo sustituye —el chat
   * es la puerta principal y WhatsApp el escape—, y un escape que sólo existe en la pantalla anterior
   * no sirve cuando el vendedor no contesta. No expone nada nuevo: el teléfono ya es público en el
   * censo de tiendas. Puede ser `null`, y entonces no se pinta el botón.
   */
  phoneContact: string | null;
}

/**
 * Una conversación del comprador con una tienda.
 *
 * `conversationId` es el hilo REAL del motor de chat —el mismo que ve el vendedor desde su lado—:
 * los mensajes se piden con él a `/lifebook/chat/conversations/:id/messages`, como cualquier otro
 * chat de la app. Este objeto es la CARA comercial de ese hilo, no un hilo aparte.
 */
export interface EcomerseChat {
  conversationId: string;
  seller: EcomerseChatSeller;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
  createdAt: string | null;
}

/**
 * Lo que devuelve abrir un chat. `created` distingue «se acaba de crear» de «ya estaba» —el
 * servidor lo sabe porque el `INSERT` devuelve fila sólo cuando de verdad insertó—, y
 * `openingMessageSent` dice si además se mandó el primer mensaje citando el anuncio.
 */
export interface EcomerseChatAbierto {
  conversationId: string;
  created: boolean;
  openingMessageSent: boolean;
  seller: EcomerseChatSeller;
}

/**
 * EL VEREDICTO de una reclamación (Fase 5 del pie). Son TRES valores y no cuatro.
 *
 * La referencia del plan (`oms_order_return_apply`) trae 待处理 · 退货中 · 已完成 · 已拒绝. Aquí no
 * hay 退货中 (*devolución en curso*) porque **no existe ese trámite**: la devolución física del
 * artículo no está modelada en ningún sitio —el reembolso de hoy es un acto del administrador, no un
 * viaje del paquete de vuelta—. Inventarse un estado intermedio que nada puede activar sería pintar
 * una pestaña que siempre está vacía.
 *
 * `pending`    — abierta, el administrador no ha decidido (待处理)
 * `refunded`   — se falló a favor del comprador y el pedido se canceló (已完成, «éxito»)
 * `rejected`   — se falló a favor del vendedor y el pedido siguió entregado (已拒绝, «fallo»)
 *
 * Y ADEMÁS PUEDE SER `null`, que NO es `'pending'`: `null` significa «no consta» —una reclamación de
 * antes de que la base guardara el veredicto, cuya resolución no se pudo atribuir con certeza—. La
 * pantalla lo pinta como «en revisión» porque es lo honesto, pero el tipo no miente por ella.
 */
export type EcomerseDisputeOutcome = 'pending' | 'refunded' | 'rejected';

/**
 * Una reclamación del comprador (退款售后).
 *
 * `outcome` es el veredicto GUARDADO EN LA FILA, no derivado del pedido. Se materializó en la
 * migración 024 porque derivarlo es demostrablemente incorrecto: el evento de resolución no guarda a
 * qué reclamación se refiere, así que un pedido con dos reclamaciones no se puede desenredar.
 */
export interface EcomerseDispute {
  id: string;
  orderId: string;
  /** La referencia corta del pedido («78371287»), la misma que usan los textos de aviso. */
  orderRef: string;
  reason: string;
  /** Las URLs de las pruebas que adjuntó el comprador. Lista vacía si no adjuntó nada. */
  evidence: string[];
  /** El ciclo de vida: `open` | `resolved`. */
  status: string;
  outcome: EcomerseDisputeOutcome | null;
  /** El texto que dejó el administrador al resolver. `null` mientras siga abierta. */
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /** La tienda reclamada. */
  sellerName: string | null;
  /** Lo devuelto: el total del pedido si hubo reembolso, 0 si no. */
  refundXaf: number;
  /** El total del pedido: el importe en disputa, se haya devuelto o no. */
  totalXaf: number;
  /** El artículo reclamado, congelado. `null` si el pedido no guardó líneas. */
  product: EcomerseArticuloPedido | null;
}

/**
 * Los recuentos por veredicto, para las pestañas. Los TRES vienen siempre, aunque estén a cero, y por
 * el mismo motivo que en los avisos: la pantalla pinta tres pestañas fijas y un valor ausente la
 * obligaría a inventarse el que falta. Los cuenta la BASE sobre todas las filas, no el cliente sobre
 * las que llegaron: la lista viene recortada a 100 y contarlas ahí daría un número falso.
 */
export interface EcomerseDisputeCounts {
  pending: number;
  refunded: number;
  rejected: number;
}

export const ecomerseApi = {
  flags: () => http.get<{ f1: boolean; cash: boolean; billing: boolean; escrow: boolean }>(e('/ecomerse/flags'), false),
  /**
   * El catálogo público. `q` es libre y viaja tal cual: `category`, `subcategory`, `priceMin`,
   * `priceMax`, `city`, `q` (texto) y —desde el 21-sep— **`sellerId`**, que devuelve solo los
   * anuncios de una tienda.
   *
   * `sellerId` existe porque la página de una tienda pedía el catálogo **entero** y filtraba en el
   * cliente: además de traerse todo el Mercado para pintar una tienda, con más de 200 anuncios
   * activos los de esa tienda que cayeran fuera de esos 200 desaparecían sin avisar.
   */
  catalog: (q: Record<string, string> = {}) => {
    const qs = new URLSearchParams(q).toString();
    return http.get<EcomerseProduct[]>(e(`/ecomerse/catalog${qs ? '?' + qs : ''}`), false);
  },
  product: (id: string) => http.get<EcomerseProduct>(e(`/ecomerse/products/${id}`), false),
  /**
   * Los EJES y las COMBINACIONES de un anuncio. Público, como la ficha.
   *
   * Existe aparte de `product(id)` a propósito: el editor del comerciante necesita la lista
   * autoritativa de ejes justo antes de escribir encima, y la ficha —que ya los trae— puede estar
   * cacheada de una visita anterior. Aquí se pregunta por ellos solos.
   *
   * Un anuncio sin combinaciones contesta `{ options: [], variants: [] }`, que es exactamente lo que
   * la pantalla necesita para saber que se vende entero.
   */
  productOptions: (id: string) =>
    http.get<{ options: EcomerseOptionGroup[]; variants: EcomerseProductVariant[] }>(
      e(`/ecomerse/products/${id}/options`), false),
  categories: () => http.get<EcomerseCategory[]>(e('/ecomerse/categories'), false),
  /**
   * EL CENSO de tiendas. Público, como el catálogo: el directorio se abre sin sesión.
   *
   * Sustituye a la lista que el directorio **derivaba del catálogo** agrupando por `seller.id`:
   * aquella no podía ver una tienda **sin anuncios activos** (no había de dónde sacarla) y se
   * quedaba corta a partir de 200 anuncios **sin avisar**. Esta sale de las tiendas, y trae `total`
   * y `anuncios` contados por el servidor.
   *
   * Filtros que acepta hoy el servidor: `q` (nombre o descripción, sin tildes ni mayúsculas),
   * `city`, `category`, `sort` (`recommended` · `rating` · `newest` · `name`) y `limit` (1–200).
   * La pantalla no usa ninguno todavía; se pasan como `Record<string, string>` para no inventar
   * parámetros que el backend no lea.
   */
  sellers: (q: Record<string, string> = {}) => {
    const qs = new URLSearchParams(q).toString();
    return http.get<EcomerseSellersResponse>(e(`/ecomerse/sellers${qs ? '?' + qs : ''}`), false);
  },
  /**
   * UNA tienda. Público.
   *
   * Existe aparte del censo y del catálogo porque la página de una tienda tomaba su cabecera del
   * **primer anuncio** del catálogo: una tienda activa sin anuncios activos se quedaba sin nombre,
   * sin ciudad y sin escudo —con un hueco que se lee como «no ha cargado»— y la cabecera dependía
   * del `LIMIT 200` de otro endpoint. La tienda existe aunque hoy no venda.
   */
  seller: (id: string) => http.get<EcomerseSellerCard>(e(`/ecomerse/sellers/${id}`), false),

  /* ── LAS TIENDAS QUE SIGO (店铺关注, Fase 6 del pie) ────────────────────────────────────────
     Tres rutas con tres trabajos:
       · `myStoreFollows`   — la lista, con la FORMA de tarjeta del censo (mismo componente);
       · `followingStoreIds`— los ids, para que la página de una tienda sepa si la sigue SIN
         bajarse la lista entera (mismo motivo y misma forma que `favoriteIds`);
       · `followStore`      — el toggle. POST y no PUT porque no se manda el estado deseado: se pide
         EL CAMBIO, el mismo criterio que `favoritesToggle`. Sin cuerpo: el sujeto es el id de la
         ruta y el dueño es el token. */
  followStore: (sellerId: string) =>
    http.post<{ following: boolean; followerCount: number }>(e(`/ecomerse/sellers/${sellerId}/follow`), undefined, true),
  myStoreFollows: () =>
    http.get<{ total: number; sellers: EcomerseTiendaSeguida[] }>(e('/ecomerse/sellers/following'), true),
  followingStoreIds: () => http.get<string[]>(e('/ecomerse/sellers/following/ids'), true),
  sellerMe: () => http.get<EcomerseSellerMe>(e('/ecomerse/seller/me'), true),
  shopPlan: () => http.get<EcomerseShopPlan>(e('/ecomerse/shop/plan'), true),
  upsertSeller: (body: Record<string, unknown>) =>
    http.post<{ message: string; status: string; sellerId?: string }>(e('/ecomerse/seller'), body, true),
  myProducts: () => http.get<EcomerseProduct[]>(e('/ecomerse/products'), true),
  createProduct: (body: Record<string, unknown>) =>
    http.post<{ message: string; productId: string; status: string }>(e('/ecomerse/products'), body, true),
  updateProduct: (id: string, body: Record<string, unknown>) =>
    http.put<{ message: string }>(e(`/ecomerse/products/${id}`), body, true),

  /**
   * ── LOS DOS CARRILES (zona del comerciante, 20-sep-2026) ──────────────────────────────────────
   *
   * `updateProduct` (arriba) es el CARRIL MODERADO: contenido y vuelve a revisión.
   * Estas dos son el CARRIL RÁPIDO: la operación del día a día, que **no** pasa por moderación
   * porque no es lo que el moderador juzgó. La regla, en una frase: *la moderación aprueba el
   * anuncio; el comerciante administra la operación.*
   *
   * Por qué hacían falta: hasta ahora el único camino de edición exigía `draft|rejected` y
   * reescribía `status='pending'`, así que **un anuncio vivo era inmutable**. Reponer existencias
   * costaba despublicar y esperar 24–48 h de revisión, y «pausar» o «retirar» no existían.
   *
   * El servidor devuelve el estado REAL resultante (no el que se pidió) y por eso se tipa: si pides
   * `active` con 0 existencias, contesta `sold_out`, y la pantalla tiene que poder decirlo.
   */

  /** Existencias, plazo de preparación y devoluciones. NO vuelve a moderación. */
  updateProductOperations: (id: string, body: { stock?: number; handlingHours?: 24 | 48 | 72; returnsAccepted?: boolean }) =>
    http.patch<{ message: string; producto: { id: string; stock: number; status: string; handlingHours: number; returnsAccepted: boolean } }>(
      e(`/ecomerse/seller/products/${id}/operations`), body, true),

  /** Poner a la venta, pausar o retirar. NO vuelve a moderación. */
  updateProductState: (id: string, state: 'active' | 'paused' | 'removed') =>
    http.patch<{ message: string; sinCambio?: boolean; producto: { id: string; stock: number; status: string } }>(
      e(`/ecomerse/seller/products/${id}/state`), { state }, true),

  /**
   * ── LOS EJES Y LAS COMBINACIONES (fase 4 · SKU, 21-sep-2026) ──────────────────────────────────
   *
   * **Carril rápido, y por eso vive aquí y no junto a `updateProduct`.** El precio y el stock de cada
   * combinación («Talla M: 3 unidades») se corrige en el día a día: reponer una talla no puede costar
   * 24–48 h de revisión. El servidor lo tiene montado igual —`PUT seller/products/:id/options` no
   * toca el `status` y no deja entrar el anuncio de otro vendedor.
   *
   * Es `PUT` y se manda **siempre la lista COMPLETA**: es la forma de decir «estos son mis ejes
   * ahora». `{ options: [], variants: [] }` es «este anuncio ya no tiene combinaciones», y es una
   * operación legítima (vuelve a venderse entero). Mandar solo los ejes, sin `variants`, es otra cosa:
   * el servidor compara los ejes nuevos contra las combinaciones que ya existen.
   *
   * La respuesta trae lo GUARDADO, no lo pedido (los `id` de ejes y combinaciones los asigna el
   * servidor) y el `stock` del anuncio ya espejado, que es la suma de las combinaciones. Se devuelve
   * para que la pantalla no tenga que volver a preguntar.
   */
  updateProductOptions: (id: string, body: { options: EcomerseOptionGroup[]; variants?: EcomerseProductVariant[] }) =>
    http.put<{ message: string; options: EcomerseOptionGroup[]; variants: EcomerseProductVariant[]; stock: number }>(
      e(`/ecomerse/seller/products/${id}/options`), body, true),
  /**
   * Crear pedido. Con pago por MONEDERO (parche 101) el servidor exige el token de pago
   * (PIN, scope ESCROW_LOCK, importe EXACTO) en `X-Payment-Token`; el importe queda en
   * garantía y el vendedor cobra en su monedero al entregar. Ojo: el monedero admite
   * compras de UNA sola tienda (el token va ligado a un importe).
   *
   * `variantId` por línea (fase 4): si el anuncio tiene combinaciones es **obligatorio**, y el
   * servidor rechaza la línea que no lo traiga o que traiga una combinación de otro anuncio. El
   * precio que se cobra es el de la combinación, no el del anuncio.
   */
  createOrder: (body: { productId?: string; qty?: number; items?: Array<{ productId: string; qty: number; variantId?: string }>; paymentMethod?: 'cash' | 'billing' | 'likebook_wallet'; deliveryAddress?: string; note?: string; idempotencyKey?: string; fulfillmentType?: 'seller' | 'agent'; agentId?: string; deliveryZoneId?: string | null; deliveryKm?: number | null }, paymentToken?: string) =>
    httpRequest<{ message: string; order: EcomerseOrder; orders?: EcomerseOrder[]; billingOrderId: string | null; orderCount?: number; idempotent?: boolean }>(e('/ecomerse/orders'), {
      method: 'POST',
      body,
      auth: true,
      ...(paymentToken ? { headers: { 'X-Payment-Token': paymentToken } } : {}),
    }),
  /**
   * Mis pedidos. Devuelve `{ orders, total, limit, offset }` (tanda B): el filtro por estado y la
   * paginación necesitan el total, y un array pelado no lo puede dar.
   */
  myOrders: (as: 'buyer' | 'seller' = 'buyer', opts?: { status?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams({ as });
    if (opts?.status) q.set('status', opts.status);
    if (opts?.limit !== undefined) q.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) q.set('offset', String(opts.offset));
    return http.get<{ orders: EcomerseOrder[]; total: number; limit: number; offset: number }>(e(`/ecomerse/orders?${q.toString()}`), true);
  },
  /** Contadores por estado, para las pestañas del filtro. */
  orderCounts: (as: 'buyer' | 'seller' = 'buyer') =>
    http.get<{ total: number; porEstado: Record<string, number> }>(e(`/ecomerse/orders/counts?as=${as}`), true),
  /** Moderación de documentación (solo ADMIN): cola de pendientes y decisión. */
  adminDocs: () => http.get<EcomerseDocPendiente[]>(e('/ecomerse/admin/docs'), true),
  adminDecideDoc: (id: string, approve: boolean, reason?: string) =>
    http.put<{ message: string }>(e(`/ecomerse/admin/docs/${id}`), { approve, reason }, true),
  updateStatus: (id: string, status: string) =>
    http.put<{ message: string }>(e(`/ecomerse/orders/${id}/status`), { status }, true),
  cancelOrder: (id: string, reason?: string) =>
    http.post<{ message: string }>(e(`/ecomerse/orders/${id}/cancel`), { reason }, true),
  orderEvents: (id: string) => http.get<EcomerseOrderEvent[]>(e(`/ecomerse/orders/${id}/events`), true),
  shipment: (id: string) => http.get<EcomerseShipment>(e(`/ecomerse/orders/${id}/shipment`), true),
  updateShipment: (id: string, status: string) =>
    http.put<{ message: string }>(e(`/ecomerse/orders/${id}/shipment/status`), { status }, true),
  openDispute: (id: string, reason: string) =>
    http.post<{ message: string; disputeId: string }>(e(`/ecomerse/orders/${id}/dispute`), { reason }, true),
  review: (id: string, rating: number, comment?: string) =>
    http.post<{ message: string }>(e(`/ecomerse/orders/${id}/review`), { rating, comment }, true),
  reportProduct: (id: string, reason: string, note?: string) =>
    http.post<{ message: string }>(e(`/ecomerse/products/${id}/report`), { reason, note }, true),
  // --- Ecomerse v3: favoritos (Xianyu) + búsqueda por imagen ---
  favoritesToggle: (productId: string) =>
    http.post<{ favorited: boolean; favoriteCount: number }>(e('/ecomerse/favorites/toggle'), { productId }, true),
  favoritesSpecial: (productId: string) =>
    http.post<{ special: boolean }>(e('/ecomerse/favorites/special'), { productId }, true),
  featureFree: (productId: string) =>
    http.post<{ ok: boolean; days: number }>(e('/ecomerse/featured/free'), { productId }, true),
  favoriteIds: () => http.get<string[]>(e('/ecomerse/favorites/ids'), true),
  myFavorites: (q: Record<string, string> = {}) => {
    const qs = new URLSearchParams(q).toString();
    return http.get<EcomerseProduct[]>(e(`/ecomerse/favorites${qs ? '?' + qs : ''}`), true);
  },
  myPurchased: () => http.get<EcomerseProduct[]>(e('/ecomerse/favorites/purchased'), true),
  // --- Logística por zonas (v4.2) ---
  deliveryZones: (city?: string) => http.get<EcomerseDeliveryZone[]>(e(`/ecomerse/delivery/zones${city ? '?city=' + encodeURIComponent(city) : ''}`), false),
  quoteLogistics: (zone: string, km?: number | null) =>
    http.get<{ feeXaf: number; breakdown: { zone: string; baseFeeXaf: number; perKmXaf: number; km: number } | null }>(
      e(`/ecomerse/delivery/quote?zone=${zone}${km ? '&km=' + km : ''}`), false),
  // --- Leads de contacto (v4.4): registro sin fricción del trato fuera del funnel ---
  contactIntent: (productId: string, channel: 'whatsapp' | 'call') =>
    http.post<{ ok: boolean }>(e('/ecomerse/contact/intent'), { productId, channel }, true),
  // --- Upload de fotos como ARCHIVO (multipart, sin base64 en JSON) ---
  uploadPhoto: (form: FormData) =>
    httpRequest<{ url: string }>(e('/ecomerse/upload'), { method: 'POST', auth: true, form }),
  searchImage: (form: FormData) =>
    httpRequest<{ query: string; total: number; products: EcomerseProduct[] }>(e('/ecomerse/search/image'), {
      method: 'POST',
      auth: true,
      form,
    }),
  /* ── La AGENDA DE DIRECCIONES del comprador (Fase 2 del pie) ──────────────────────────────
     La lista es un ARRAY y no `{total, items}` a propósito: no se recorta. El tope son 20 por
     usuario y se devuelven las 20, así que no hay «mostrando N de M» que avisar. La regla del
     objeto con `total` es para los endpoints que SÍ pueden recortar. */
  addresses: () => http.get<EcomerseAddress[]>(e('/ecomerse/addresses'), true),
  createAddress: (body: EcomerseAddressInput) =>
    http.post<EcomerseAddress>(e('/ecomerse/addresses'), body, true),
  updateAddress: (id: string, body: EcomerseAddressInput) =>
    http.put<EcomerseAddress>(e(`/ecomerse/addresses/${id}`), body, true),
  /** Marcar predeterminada: ruta propia, sin cuerpo y sin exigir la dirección entera. Idempotente. */
  setDefaultAddress: (id: string) =>
    http.put<EcomerseAddress>(e(`/ecomerse/addresses/${id}/default`), undefined, true),
  deleteAddress: (id: string) =>
    http.delete<EcomerseAddressBorrada>(e(`/ecomerse/addresses/${id}`), true),

  /* ── LOS AVISOS DEL COMPRADOR: los dos canales (Fase 3 del pie) ────────────────────────────
     La bandeja devuelve `{ channel, items }` y no un array pelado: la respuesta DICE de qué canal
     son los avisos que trae (`null` = los dos), así que la pantalla no tiene que deducirlo del
     filtro que ella misma pidió. La ventana son 100 avisos por consulta.

     POR ESO EL CONTADOR SE PREGUNTA APARTE. Contar los `items` que llegaron diría «12 sin leer»
     en cuanto hubiera más de 100 avisos, cuando podrían ser 40: `noticeCounts` los cuenta la base,
     entera. Cada dato, de donde se sabe completo. */
  notices: (channel?: EcomerseNoticeChannel) =>
    http.get<{ channel: EcomerseNoticeChannel | null; items: EcomerseNotice[] }>(
      e(`/ecomerse/notices${channel ? `?channel=${channel}` : ''}`), true),
  noticeCounts: () => http.get<EcomerseNoticeCounts>(e('/ecomerse/notices/counts'), true),
  /** Marcar uno como leído. Idempotente: `marked: 0` significa «ya estaba leído», no un error. */
  markNoticeRead: (id: string) =>
    http.put<{ message: string; marked: number }>(e(`/ecomerse/notices/${id}/read`), undefined, true),
  /** «Marcar todo leído»: sin `channel`, los dos canales a la vez. */
  markAllNoticesRead: (channel?: EcomerseNoticeChannel) =>
    http.put<{ message: string; marked: number }>(
      e(`/ecomerse/notices/read-all${channel ? `?channel=${channel}` : ''}`), undefined, true),

  /* ── LA CONVERSACIÓN CON UNA TIENDA (Fase 4 del pie) ────────────────────────────────────────
     DOS rutas y ninguna más, a propósito: el hilo —leer los mensajes, enviarlos, marcar leído— lo
     sirve el motor de chat que ya existe (`lifebookChatApi`), y aquí sólo se le pone la cara de la
     tienda. Por eso lo que devuelve se llama `conversationId`: es un hilo de verdad, no una copia.
     Duplicar el envío de mensajes habría dejado dos caminos que escriben en la misma tabla.

     La lista es `{ chats }` y no un array pelado para que la respuesta pueda crecer —un `total`, un
     aviso de recorte— sin romper a quien la lee hoy. */
  chats: () => http.get<{ chats: EcomerseChat[] }>(e('/ecomerse/chats'), true),
  /**
   * Abre (o recupera) el hilo con una tienda. `sellerId` es la TIENDA, no su dueño: el servidor
   * resuelve el interlocutor, así que el botón no puede acabar escribiendo a cualquiera.
   *
   * Con `productId`, el primer mensaje cita ese anuncio —«me interesa esto»—, y SÓLO si el hilo
   * estaba vacío y el anuncio es de esa tienda. Como las dos condiciones son del servidor, el
   * resultado lo dice: `openingMessageSent`. La pantalla no lo deduce.
   */
  openChat: (sellerId: string, productId?: string | null) =>
    http.post<EcomerseChatAbierto>(e('/ecomerse/chats/open'), { sellerId, productId: productId ?? null }, true),

  /* ── MIS RECLAMACIONES: 退款售后 (Fase 5 del pie) ────────────────────────────────────────────
     UNA sola ruta, de LECTURA. Abrir una reclamación ya tiene la suya (`openDispute`, más arriba) y
     resolverla es cosa del administrador, así que aquí no hay `create` ni `resolve`: lo que faltaba
     era poder VERLAS desde el lado de quien las abrió.

     La respuesta es `{ disputes, counts, total }` y no un array pelado. `disputes` es la lista —hasta
     100 filas— y `counts` son los recuentos de verdad, los que la base calcula sobre TODAS: las tres
     pestañas no pueden sacar su número de la lista, porque con más de 100 reclamaciones dirían un
     número recortado sin avisar. Es la misma separación que en la bandeja (`notices` y
     `noticeCounts`), por el mismo motivo. */
  myDisputes: () =>
    http.get<{ disputes: EcomerseDispute[]; counts: EcomerseDisputeCounts; total: number }>(
      e('/ecomerse/disputes'), true),
  /**
   * UNA reclamación, para su ficha.
   *
   * TIENE RUTA PROPIA Y NO SE BUSCA EN LA LISTA. La lista viene recortada a 100 filas, así que buscar
   * ahí dentro haría que una reclamación propia que cayera fuera de la ventana se leyera como «no
   * existe». Esta consulta va a por la fila, sin ventana. Una reclamación ajena contesta 404 —no 403—,
   * igual que en la agenda de direcciones: que exista pero no sea tuya no es cosa de un tercero.
   */
  dispute: (id: string) => http.get<EcomerseDispute>(e(`/ecomerse/disputes/${id}`), true),
};
