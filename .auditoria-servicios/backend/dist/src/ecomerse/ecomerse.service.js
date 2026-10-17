"use strict";
// =============================================================================
// EcomerseService — Marketplace estilo Xianyu adaptado a Guinea Ecuatorial.
// F1 operativo: vendedores con REQUISITOS (KYC aprobado + datos negocio +
// aprobación admin), productos moderados, pedidos cash|billing, garantía 7 días,
// disputas y reviews. Escrow F2 PREPARADO pero INACTIVO (sin rutas) hasta
// autorización regulatoria (BEAC/MinFinanzas) — solo existe en BD.
// =============================================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcomerseService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../http/prisma.service");
const mobility_prisma_service_1 = require("../mobility/mobility-prisma.service");
const billing_service_1 = require("../billing/billing.service");
const wallet_service_1 = require("../services/wallet.service");
const sms_service_1 = require("../http/sms.service");
const ecomerse_storage_service_1 = require("./ecomerse-storage.service");
const ecomerse_dto_1 = require("./ecomerse.dto");
const opciones_producto_1 = require("../services/opciones-producto");
const crypto = __importStar(require("crypto"));
const tf = __importStar(require("@tensorflow/tfjs-node"));
const WARRANTY_DAYS = 7;
const ORDER_ACTIVE = ['pending', 'confirmed', 'in_transit'];
// ---------------------------------------------------------------------------
// Monetización de la tienda (Ecomerse v4.2): cuota por 4 planes derivada de
// entitlements Billing, escalera de 7 destacados y tarifa logística por zonas.
// ---------------------------------------------------------------------------
const SHOP_BASIC_QUOTA = 8; // productos activos en tienda Gratis
const SHOP_PLAN_CODES = ['ecomerse_shop_flash', 'ecomerse_shop_pro', 'ecomerse_shop_pro_max'];
const FEATURED_CODES = [
    'ecomerse_featured_mini_flash', 'ecomerse_featured_flash', 'ecomerse_featured_lite_mini',
    'ecomerse_featured_lite', 'ecomerse_featured_mini_pro', 'ecomerse_featured_pro', 'ecomerse_featured_pro_max',
];
const LOGISTICS_DEFAULT_FEE = Number(process.env.ECOMMERSE_LOGISTICS_FEE_XAF ?? 500); // fallback sin zona
// ---------------------------------------------------------------------------
// Búsqueda por imagen (Ecomerse v3): embeddings mobilenet v1 0.25 en el
// servidor (carga perezosa, un singleton). El modelo vive en el repo del
// backend (models/mobilenet_v1_0.25_224/) — sin dependencias externas.
// ---------------------------------------------------------------------------
const IMG_MODEL_PATH = process.env.ECOMMERSE_IMG_MODEL_PATH
    ?? '/opt/malabogo/escrow-wallet/models/mobilenet_v1_0.25_224/model.json';
const IMG_MODEL_NAME = 'mobilenet_v1_0.25';
const IMG_MATCH_MIN = 0.42; // umbral de coseno para "productos similares"
let imgModelPromise = null;
function getImgModel() {
    if (!imgModelPromise) {
        imgModelPromise = (async () => {
            const m = await tf.loadLayersModel('file://' + IMG_MODEL_PATH);
            return m;
        })();
    }
    return imgModelPromise;
}
// Feature flags (env). F1 activo por defecto; escrow SIEMPRE inactivo en F1.
const FLAG = {
    f1: (process.env.ECOMMERSE_F1_ENABLED ?? 'true') !== 'false',
    cash: (process.env.ECOMMERSE_CASH_ENABLED ?? 'true') !== 'false',
    billing: (process.env.ECOMMERSE_BILLING_ENABLED ?? 'true') !== 'false',
    escrow: (process.env.ECOMMERSE_ESCROW_ENABLED ?? 'false') === 'true', // NUNCA true en F1
    imageSearch: (process.env.ECOMMERSE_IMAGE_SEARCH_ENABLED ?? 'true') !== 'false',
    // 17/09 (parche 101): pago con el MONEDERO (retenido → cobrado al entregar → devuelto al
    // cancelar). El `escrow` de F2 (con tokens y modelo propio) sigue inactivo: esto usa el libro
    // del monedero, que es el que existe y está probado.
    wallet: (process.env.ECOMMERSE_WALLET_ENABLED ?? 'true') !== 'false',
};
/**
 * La FORMA de un id que llega por la URL. Una sola definición, usada por el guardián de producto y
 * por el de tienda: si estuviera escrita dos veces, un día las dos copias aceptarían formas
 * distintas y la que se quedara corta dejaría pasar un id al `::uuid` del motor —que responde con
 * `PrismaClientKnownRequestError`, es decir, un 500 por una petición mal hecha y cien líneas de
 * ruido en el log justo cuando alguien busca el error de verdad.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * El PLEGADO DE ACENTOS para buscar por texto: envuelve una expresión SQL y la deja comparable
 * ignorando tildes y mayúsculas.
 *
 * POR QUÉ HACE FALTA. `ILIKE` ignora las mayúsculas pero **no las tildes**: quien escribe «abaceria»
 * no encontraba «Abacería», y en Guinea Ecuatorial los nombres de tienda y de ciudad llevan tilde
 * (Abacería, Ebebiyín, Evinayong) y casi nadie la teclea. El filtro de ciudad ya lo hacía a mano,
 * copiado literalmente en dos sitios; esto lo deja en una sola definición para los cuatro filtros de
 * texto del módulo.
 *
 * OJO AL EDITARLO: las dos listas de `translate` tienen que tener **la misma longitud**. Si la de
 * destino se queda corta, `translate` no falla: **borra** el carácter sobrante, y el resultado no es
 * un error sino búsquedas que no encuentran nada.
 */
const pliega = (expr) => `translate(lower(${expr}), 'áéíóúñÁÉÍÓÚÑ', 'aeiounaeioun')`;
let EcomerseService = class EcomerseService {
    prisma;
    mobility;
    billing;
    sms;
    storage;
    wallets;
    /**
     * Los ejes y las combinaciones (Fase 4 · SKU) usan el MISMO módulo que el otro mercado de la
     * app (`lifebook`), que lleva con esto desde septiembre. No se copia la validación: se comparte.
     * Lo único que cambia entre los dos es el nombre de las tablas (y el de la columna de fotos,
     * que se resuelve en `setProductOptions`). Ver `src/services/opciones-producto.ts`.
     */
    opciones = new opciones_producto_1.OpcionesProducto(opciones_producto_1.TABLAS_ECOMERSE);
    constructor(prisma, mobility, billing, sms, storage, 
    // Parche 101: el monedero cobra los pedidos de Ecomerse.
    wallets) {
        this.prisma = prisma;
        this.mobility = mobility;
        this.billing = billing;
        this.sms = sms;
        this.storage = storage;
        this.wallets = wallets;
    }
    /** Estado de los feature flags (para debug/admin). */
    flags() { return { ...FLAG }; }
    /** Parse Zod: lanza BadRequest con el primer mensaje claro. Infiere el tipo del esquema. */
    parse(schema, data) {
        const r = schema.safeParse(data);
        if (!r.success) {
            const msg = r.error.issues[0]?.message ?? 'Datos inválidos';
            throw new common_1.BadRequestException(msg);
        }
        return r.data;
    }
    // ------------------------------------------------------------------ CATÁLOGO
    /**
     * El NIVEL DE TIENDA (0–3), derivado de los pagos vivos: **3 Pro Max · 2 Pro · 1 Flash · 0 Gratis**.
     *
     * POR QUÉ ES UN MÉTODO Y NO UNA CADENA COPIADA: esta expresión decide tres cosas a la vez —el
     * orden del catálogo, el orden del censo de tiendas y el sello `Pro` de la tarjeta— y ya estaba
     * escrita **dos veces** en este fichero (en el catálogo y en la ficha), con la misma lista de
     * códigos y el mismo `status IN` repetidos a mano. Con dos copias, el día que se añada un plan se
     * añade en una y el directorio empieza a contradecir a la rejilla sin que nada falle.
     *
     * `alias` es el alias de `wallet.ecomerse_sellers` en la consulta que la usa: la expresión se
     * construye con él, así que **solo vale para consultas donde la tienda se llame así** (`s` en las
     * tres de hoy). No lleva parámetros `$n` ni entrada del usuario: los códigos de plan son literales
     * congelados, que es lo que permite interpolarla en el SQL.
     */
    rangoDeTienda(alias = 's') {
        const plan = (code, rango) => `WHEN EXISTS (SELECT 1 FROM wallet.billing_entitlements be`
            + ` WHERE be.user_id = ${alias}.user_id AND be.module='ecomerse'`
            + ` AND be.code='${code}' AND be.status IN ('active','expiring_soon','grace')) THEN ${rango}`;
        return `(CASE ${plan('ecomerse_shop_pro_max', 3)} ${plan('ecomerse_shop_pro', 2)} ${plan('ecomerse_shop_flash', 1)} ELSE 0 END)`;
    }
    /**
     * LOS TRES JOIN DEL ÁRBOL DE CATEGORÍAS, escritos una sola vez.
     *
     * POR QUÉ ES UN MÉTODO Y NO SEIS COPIAS: el Mercado tiene SEIS consultas que devuelven anuncios
     * con su categoría —catálogo, ficha, comprados, favoritos, búsqueda por imagen y panel de
     * admin— y todas repetían los mismos dos JOIN. Al pasar de dos niveles a tres (departamento ·
     * familia · hoja) eso significaba tocar seis sitios y acordarse de los seis; el día que alguien
     * añada la séptima consulta la escribirá mal y no fallará nada: saldrá un anuncio sin categoría.
     * Aquí se escriben una vez y se piden por nombre, igual que `rangoDeTienda`.
     *
     * Los alias son `dep` / `fam` / `hoja` y NO `d` / `f` / `l` a propósito: `f` ya es el alias de
     * `ecomerse_favorites` en `myFavorites`, y dos alias iguales en la misma consulta dan un error de
     * SQL en cuanto alguien añada la columna que falta.
     *
     * `alias` es el alias de la tabla que TIENE las columnas del árbol: `p` (anuncios) o `s`
     * (tiendas). Son las dos únicas de hoy.
     */
    joinsDeArbol(alias) {
        if (alias !== 'p' && alias !== 's')
            throw new Error(`joinsDeArbol: alias no previsto ${alias}`);
        const dosNiveles = `LEFT JOIN wallet.ecomerse_departments dep ON dep.id = ${alias}.department_id
            LEFT JOIN wallet.ecomerse_families    fam ON fam.id = ${alias}.family_id`;
        /* LA TIENDA NO LLEGA A HOJA, y no es una simplificación: `ecomerse_sellers` no tiene columna
           `leaf_id` —una tienda elige familia, no publica un artículo suelto—, así que unirla a
           `ecomerse_leaves` no daría un NULL, daría `42703 column s.leaf_id does not exist` y se llevaría
           por delante el censo entero. Medido al desplegar: `/sellers` contestó 500 hasta que se quitó. */
        return alias === 'p'
            ? `${dosNiveles}
            LEFT JOIN wallet.ecomerse_leaves      hoja ON hoja.id = ${alias}.leaf_id`
            : dosNiveles;
    }
    /** Las etiquetas del árbol, con los MISMOS alias que `joinsDeArbol`. */
    camposDeArbol() {
        return `dep.code AS department_code, dep.label AS department_label, dep.icon AS department_icon,
            fam.code AS family_code, fam.label AS family_label,
            hoja.label AS leaf_label`;
    }
    /** Etiquetas del árbol para una TIENDA, que solo llega a familia (una tienda no tiene hoja). */
    camposDeTienda() {
        return `dep.code AS department_code, dep.label AS department_label, dep.icon AS department_icon,
            fam.code AS family_code, fam.label AS family_label`;
    }
    /**
     * LA TABLA DE SEGUIDOS, ASEGURADA EN EL PRIMER USO.
     *
     * **Por qué aquí y no en una migración a mano**: la base vive en una red privada del despliegue
     * (`172.22.0.4`) y no es alcanzable desde fuera; el código, en cambio, corre dentro. La sentencia
     * es **aditiva e idempotente** (`IF NOT EXISTS`), así que repetirla no hace nada — y el SQL queda
     * también en `prisma/sql/ecomerse_seller_follows.sql` para quien prefiera ejecutarlo él.
     *
     * **Se recuerda por proceso**: una vez creada no se vuelve a preguntar en cada petición.
     */
    /**
     * ¿ESTÁ LA TABLA DE SEGUIDOS?
     *
     * **Antes esto la creaba, y estaba mal**: el rol de la aplicación no puede crear en `wallet`
     * (medido: `permission denied for schema wallet`, 42501), así que en cada primer uso se comía un
     * error y lo convertía en un 500 opaco. La tabla la aplica una **migración**
     * (`20261017080000_ecomerse_seller_follows`, con el rol de administración); aquí solo se comprueba.
     *
     * Se recuerda por proceso: es una consulta al catálogo, no a los datos.
     */
    /**
     * **La URL de lectura de una foto guardada**: la clave (`products/….jpg`) no es una URL.
     *
     * Envuelve el firmador que ya existe (`EcomerseStorageService.urlDeLectura`, URL pública o
     * presigned GET según `MINIO_SIGNED_READ`), para que la sección de seguidos no tenga que saber
     * nada del almacenamiento y no haya dos formas de firmar.
     */
    async urlDeFoto(key) {
        if (!key)
            return null;
        const limpia = String(key).trim();
        if (!limpia)
            return null;
        // Si ya viene una URL (datos viejos, pruebas), se devuelve tal cual.
        if (/^https?:\/\//i.test(limpia))
            return limpia;
        /**
         * **Con tope de tiempo, y no es pesimismo**: firmar habla con MinIO, y cuando MinIO no responde
         * desde la función la sección entera se colgaba (medido en producción: `socket hang up` y 433
         * del gateway). Una portada no puede costar la sección: si en 800 ms no hay URL, se devuelve
         * `null` y la tarjeta se pinta sin portada, que es como estaba antes.
         */
        try {
            const firma = this.storage.urlDeLectura(limpia);
            const tope = new Promise((res) => setTimeout(() => res(null), 800));
            return await Promise.race([firma, tope]);
        }
        catch (e) {
            this.log?.warn?.('no se pudo firmar la foto: ' + ((e && e.message) || e));
            return null;
        }
    }

    async hayTablaDeSeguidos() {
        if (this.__seguidosLista === true)
            return true;
        let hay = false;
        try {
            const r = await this.prisma.$queryRawUnsafe(`SELECT to_regclass('wallet.ecomerse_seller_follows')::text AS t`);
            hay = !!(r && r[0] && r[0].t);
        }
        catch (e) {
            this.log?.warn?.('seguidos: no se pudo comprobar la tabla: ' + ((e && e.message) || e));
            return false;
        }
        // **Solo se recuerda el «sí»**: un «no» puede ser un arranque temprano (o una migración a
        // medio aplicar) y quedarse pegado en un proceso reutilizado.
        if (hay)
            this.__seguidosLista = true;
        else
            this.log?.warn?.('seguidos: falta aplicar cloudbase/migrations/20261017080000_ecomerse_seller_follows.sql');
        return hay;
    }
    /**
     * SEGUIR O DEJAR DE SEGUIR una tienda. **Alterna**, como el corazón de un anuncio: la app no manda
     * el estado deseado, pide el cambio (`POST` y no `PUT`, por lo mismo).
     */
    async seguirTienda(userId, sellerId) {
        if (!FLAG.f1)
            throw new common_1.BadRequestException('Ecomerse no está habilitado');
        const id = this.exigirUuid(sellerId, 'Tienda inválida');
        if (!(await this.hayTablaDeSeguidos())) {
            // 409 y no 503: el filtro de errores de esta API **solo deja pasar los 4xx con su mensaje**
            // (los 5xx salen como «Error interno»), y esto es exactamente un conflicto con el estado del
            // servidor: falta aplicar la tabla de seguidos.
            throw new common_1.ConflictException('Los seguidos todavía no están activados en esta base (falta aplicar wallet.ecomerse_seller_follows)');
        }
        return this.prisma.$transaction(async (tx) => {
            const t = await tx.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_sellers WHERE id=$1::uuid AND status='active'`, id);
            if (!t[0])
                throw new common_1.NotFoundException('Tienda no encontrada');
            const ya = await tx.$queryRawUnsafe(`SELECT 1 FROM wallet.ecomerse_seller_follows WHERE user_id=$1::uuid AND seller_id=$2::uuid`, userId, id);
            if (ya[0]) {
                await tx.$executeRawUnsafe(`DELETE FROM wallet.ecomerse_seller_follows WHERE user_id=$1::uuid AND seller_id=$2::uuid`, userId, id);
            }
            else {
                await tx.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_seller_follows (user_id, seller_id) VALUES ($1::uuid, $2::uuid)`, userId, id);
            }
            const cnt = await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM wallet.ecomerse_seller_follows WHERE seller_id=$1::uuid`, id);
            return { following: !ya[0], followersCount: Number(cnt[0]?.n ?? 0) };
        });
    }
    /** Los IDs de las tiendas que sigo — para que la ficha sepa si ya la sigo, sin traer la lista. */
    async idsTiendasSeguidas(userId) {
        if (!(await this.hayTablaDeSeguidos()))
            return [];
        const rows = await this.prisma.$queryRawUnsafe(`SELECT seller_id FROM wallet.ecomerse_seller_follows WHERE user_id=$1::uuid ORDER BY created_at DESC`, userId);
        return rows.map((r) => String(r.seller_id));
    }
    /**
     * LAS TIENDAS QUE SIGO, con **la misma tarjeta del censo** (`mapTienda`): si devolviera otra forma,
     * la tarjeta de «siguiendo» saldría con «Vendedor» de nombre mientras la del directorio sale bien.
     * El orden es **el de cuándo las seguí** (lo último primero), que es el del feed.
     */
    async tiendasSeguidas(userId) {
        if (!FLAG.f1)
            throw new common_1.BadRequestException('Ecomerse no está habilitado');
        // Sin tabla no hay nada que enseñar: **la lista sale vacía**, que es la verdad.
        if (!(await this.hayTablaDeSeguidos()))
            return { total: 0, anuncios: 0, sellers: [] };
        const rankExpr = this.rangoDeTienda('s');
        const anunciosExpr = `(SELECT count(*)::int FROM wallet.ecomerse_products p WHERE p.seller_id = s.id AND p.status='active')`;
        const rows = await this.prisma.$queryRawUnsafe(`SELECT s.id, s.user_id, s.business_name, s.city, s.phone_contact, s.photo_key, s.description,
            s.rating_avg, s.rating_count, s.created_at, f.created_at AS followed_at,
            ${this.camposDeTienda()},
            ${rankExpr} AS seller_rank,
            ${anunciosExpr} AS anuncios
            FROM wallet.ecomerse_seller_follows f
            JOIN wallet.ecomerse_sellers s ON s.id = f.seller_id
            ${this.joinsDeArbol('s')}
            WHERE f.user_id=$1::uuid AND s.status='active'
            ORDER BY f.created_at DESC`, userId);
        const verified = await this.resolveVerified(rows.map((r) => (r.user_id ? String(r.user_id) : null)));
        return {
            total: rows.length,
            anuncios: rows.reduce((a, r) => a + Number(r.anuncios ?? 0), 0),
            sellers: rows.map((r) => ({ ...this.mapTienda(r, verified.get(String(r.user_id)) === true), since: r.followed_at })),
        };
    }
    async catalog(q = {}) {
        if (!FLAG.f1)
            throw new common_1.BadRequestException('Ecomerse no está habilitado (ECOMMERSE_F1_ENABLED=false)');
        const conds = [`p.status='active'`, `s.status='active'`];
        const params = [];
        const P = (v) => { params.push(v); return `$${params.length}`; };
        /* EL ÁRBOL, con sus tres niveles y con nombre. `department` / `family` / `leaf` son los de
           verdad; `category` y `subcategory` se siguen aceptando como alias porque son los que manda
           la app instalada, y en el árbol viejo significaban «el nivel de arriba» y «el de abajo»: esas
           21 categorías son hoy las FAMILIAS y esas 134 subcategorías las HOJAS.
           De paso el id se VALIDA aquí (`exigirUuid`) y no en el SQL: antes un `category=abc` llegaba
           a Postgres y salía un 500 por un id mal formado, que es culpa del cliente y merece un 400. */
        const dep = q.department;
        const fam = q.family ?? q.category;
        const hoja = q.leaf ?? q.subcategory;
        if (dep)
            conds.push(`p.department_id=${P(this.exigirUuid(dep, 'Departamento inválido'))}::uuid`);
        if (fam)
            conds.push(`p.family_id=${P(this.exigirUuid(fam, 'Familia inválida'))}::uuid`);
        if (hoja)
            conds.push(`p.leaf_id=${P(this.exigirUuid(hoja, 'Hoja de categoría inválida'))}::uuid`);
        if (q.priceMin)
            conds.push(`p.price_xaf >= ${P(Number(q.priceMin))}`);
        if (q.priceMax)
            conds.push(`p.price_xaf <= ${P(Number(q.priceMax))}`);
        if (q.city)
            conds.push(`${pliega('p.city')} LIKE ${pliega(P('%' + q.city + '%'))}`);
        /* El texto se busca con el mismo plegado que la ciudad. Antes era `ILIKE` a secas: «abaceria»
           no encontraba «Abacería». Es un defecto que este módulo ya tenía y que salió a la luz al
           construir el censo (donde sí se puede medir: `?q=abaceria` pasa de 0 a 1 tienda); se arregla
           aquí también porque dejar las dos búsquedas del Mercado con criterios distintos —una con
           tildes y otra sin— es peor que el defecto. */
        if (q.q)
            conds.push(`(${pliega('p.title')} LIKE ${pliega(P('%' + q.q + '%'))} OR ${pliega('p.description')} LIKE ${pliega(P('%' + q.q + '%'))})`);
        /* FILTRO POR TIENDA (21-sep-2026). La página de una tienda pedía el catálogo ENTERO y se
           quedaba con sus anuncios en el cliente: no había forma de preguntar «lo de esta tienda».
           Además de tirar ancho de banda, tenía un techo silencioso: con más de 200 anuncios activos en
           el Mercado, los de una tienda que cayeran fuera de esos 200 desaparecían sin avisar. El id se
           valida antes de entrar al SQL, como el de producto. */
        if (q.sellerId)
            conds.push(`p.seller_id = ${P(this.exigirUuid(q.sellerId, 'Tienda inválida'))}::uuid`);
        /* DESTACADOS y NIVEL DE TIENDA: dos expresiones que se usan tanto en el ORDER BY como en el
           SELECT (el nivel se devuelve al cliente para pintar el sello PRO). El nivel se le pide al
           método que lo define —`rangoDeTienda`— y no se copia aquí: el censo de tiendas ordena con la
           MISMA regla, y con dos copias un día el directorio contradiría a la rejilla. */
        const featuredExpr = `(p.is_featured AND (p.featured_until IS NULL OR p.featured_until > now()))`;
        const rankExpr = this.rangoDeTienda('s');
        /* ORDENACIÓN (tanda A, patrón del `/search` de macrozheng/mall: búsqueda + filtro + orden en
           un solo endpoint). Los cuatro valores tienen que coincidir con los del selector de la app.
           Decisión: las tiendas de pago (rankExpr) y los destacados siguen saliendo PRIMERO en todas
           las ordenaciones — es lo que esas tiendas compran — y el orden del usuario decide **dentro**
           de ese grupo. Si se ordenara por precio puro, un destacado podría caer a la página 3 y el
           producto que el vendedor pagó por promocionar no se vería nunca. */
        const orderBy = (() => {
            const promos = `${featuredExpr} DESC, ${rankExpr} DESC`;
            switch (q.sort) {
                case 'price_asc': return `${promos}, p.price_xaf ASC, p.created_at DESC`;
                case 'price_desc': return `${promos}, p.price_xaf DESC, p.created_at DESC`;
                case 'newest': return `${promos}, p.created_at DESC`;
                case 'rating': return `${promos}, s.rating_avg DESC, s.rating_count DESC, p.created_at DESC`;
                // 'recommended' (por defecto): mejor valorados y más vistos primero (sección 🔥).
                default: return `${promos}, s.rating_avg DESC, p.views DESC, p.created_at DESC`;
            }
        })();
        const rows = await this.prisma.$queryRawUnsafe(`SELECT p.*, s.user_id AS seller_user_id, s.business_name, s.rating_avg, s.rating_count, s.city AS seller_city,
              ${this.camposDeArbol()},
              ${rankExpr} AS seller_rank,
              (SELECT count(*) FROM wallet.ecomerse_favorites f WHERE f.product_id = p.id) AS favorite_count
       FROM wallet.ecomerse_products p
       JOIN wallet.ecomerse_sellers s ON s.id = p.seller_id
       ${this.joinsDeArbol('p')}
       WHERE ${conds.join(' AND ')}
       ORDER BY ${orderBy} LIMIT 200`, ...params);
        // Escudo "verificado" solo con KYC real (lote en mobility, el wallet no puede leerla)
        const verified = await this.resolveVerified(rows.map((r) => r.seller_user_id ? String(r.seller_user_id) : null));
        for (const r of rows)
            r.seller_verified = verified.get(String(r.seller_user_id)) === true;
        return rows.map((r) => this.mapProduct(r));
    }
    async product(id) {
        if (!FLAG.f1)
            throw new common_1.BadRequestException('Ecomerse no está habilitado');
        this.idDeProducto(id);
        const rows = await this.prisma.$queryRawUnsafe(`SELECT p.*, s.business_name, s.rating_avg, s.rating_count, s.phone_contact,
              s.user_id AS seller_user_id, s.photo_key AS seller_photo,
              ${this.camposDeArbol()},
              ${this.rangoDeTienda('s')} AS seller_rank,
              (SELECT count(*) FROM wallet.ecomerse_favorites f WHERE f.product_id = p.id) AS favorite_count
       FROM wallet.ecomerse_products p
       JOIN wallet.ecomerse_sellers s ON s.id = p.seller_id
       ${this.joinsDeArbol('p')}
       WHERE p.id=$1::uuid LIMIT 1`, id);
        if (!rows[0])
            throw new common_1.NotFoundException('Producto no encontrado');
        const r0 = rows[0];
        r0.seller_verified = (await this.resolveVerified([r0.seller_user_id ? String(r0.seller_user_id) : null]))
            .get(String(r0.seller_user_id)) === true;
        const producto = this.mapProduct(r0);
        /* DOCUMENTACIÓN (tanda 4 · sección 4). Se adjunta solo a la FICHA, no al feed: son datos de
           confianza que el comprador consulta cuando ya está mirando el artículo, y meterlos en cada
           tarjeta del catálogo multiplicaría las consultas sin que nadie los lea ahí.
           Se devuelven con su estado: el comprador ve si están aprobados o pendientes de revisar, en
           vez de dar por bueno un papel que nadie ha mirado (el informe de Dewu fue explícito: un
           badge sin evidencia consultable es marketing). */
        producto.docs = await this.productDocs(String(r0.id));
        /* FASE 4 · SKU: los ejes y las combinaciones van SOLO en la ficha, igual que la documentación y
           por el mismo motivo — son datos que el comprador necesita cuando ya está mirando el artículo, y
           meterlos en cada tarjeta del catálogo multiplicaría las consultas (200 productos = 400 viajes)
           sin que nadie los lea ahí. La tarjeta ya dice lo que tiene que decir con el precio y el stock
           del anuncio, que con combinaciones es la suma de ellas (`espejarStock`). */
        const sku = await this.opciones.leer(this.prisma, String(r0.id));
        producto.options = sku.options;
        producto.variants = sku.variants;
        return producto;
    }
    /**
     * EL ÁRBOL DE CATEGORÍAS: departamento → familia → hoja, los tres niveles de una vez.
     *
     * POR QUÉ TRES Y NO DOS. El árbol viejo tenía 21 categorías y 134 subcategorías, y las dos listas
     * mezclaban cosas de alturas distintas: «Teléfonos», «Ordenadores» y «Ropa de mujer» convivían al
     * mismo nivel, así que la pantalla no podía enseñar 20 bloques y luego abrir uno. Con tres
     * niveles cada cosa está donde se busca: 18 departamentos (los bloques con los que se abre el
     * Mercado), 110 familias (la columna de en medio) y 502 hojas, que son donde de verdad se publica
     * un anuncio.
     *
     * ES UNA SOLA CONSULTA, a propósito: son unas 630 filas, y responderlas en tres llamadas
     * obligaría a la app a pedir la segunda antes de poder pintar la primera. Se anida en el SQL
     * —`jsonb_agg` dentro de `jsonb_agg`— y llega ya montado.
     *
     * `subs` SE SIGUE DEVOLVIENDO y es la misma lista de familias sin sus hojas: en el árbol viejo
     * `subs` eran los niveles de abajo, y esos son hoy las familias. Una app sin actualizar sigue
     * pintando su selector de dos pasos con las mismas etiquetas. No se le cuelgan las hojas dentro
     * —serían 502 objetos repetidos dos veces en la misma respuesta—: duplicar media respuesta para
     * servir a un cliente que se actualiza en este mismo cambio es peor que no hacerlo.
     */
    async categories() {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT d.id, d.code, d.label, d.icon,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', f.id, 'code', f.code, 'label', f.label, 'icon', f.icon,
                          'hojas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                               'id', l.id, 'code', l.code, 'label', l.label)
                                               ORDER BY l.sort_order)
                                               FROM wallet.ecomerse_leaves l
                                              WHERE l.family_id = f.id AND l.active = true), '[]'::jsonb))
                          ORDER BY f.sort_order)
                         FROM wallet.ecomerse_families f
                        WHERE f.department_id = d.id AND f.active = true), '[]'::jsonb) AS familias
         FROM wallet.ecomerse_departments d
        WHERE d.active = true
        ORDER BY d.sort_order`);
        return rows.map((r) => {
            const familias = (r.familias ?? []).map((f) => ({
                id: String(f.id), code: f.code, label: f.label, icon: f.icon ?? null,
                /* Las HOJAS no llevan icono: `ecomerse_leaves` no tiene esa columna. El emoji vive en el
                   departamento, que es lo que pinta el bloque de arriba; poner uno por hoja serían 502
                   emojis que nadie ha elegido. */
                hojas: (f.hojas ?? []).map((l) => ({
                    id: String(l.id), code: l.code, label: l.label,
                })),
            }));
            return {
                id: String(r.id), code: r.code, label: r.label, icon: r.icon ?? null,
                familias,
                /** Compatibilidad: lo que el árbol viejo llamaba «subcategorías» son hoy las FAMILIAS. */
                subs: familias.map((f) => ({ id: f.id, code: f.code, label: f.label, icon: f.icon })),
            };
        });
    }
    // ------------------------------------------------------------------ CENSO DE TIENDAS
    /**
     * El CENSO de tiendas activas: `GET /ecomerse/sellers`. Público, como el catálogo.
     *
     * POR QUÉ EXISTE. El directorio de la app (`/ecomerse-tiendas`) se construía **agrupando el
     * catálogo por `seller.id`**, y eso tiene dos agujeros que ya estaban escritos en la cabecera de
     * aquella pantalla:
     *   · Una tienda **sin anuncios activos no aparecía**. No había de dónde sacarla: la lista salía
     *     de los anuncios. Por eso el rótulo decía «N tiendas · M anuncios» y no prometía un censo.
     *   · El catálogo lleva `LIMIT 200`: por encima de 200 anuncios, la lista **se quedaba corta sin
     *     avisar**. Hoy son 10 anuncios y 2 tiendas, y así el directorio era honesto; el día que
     *     crezca, ese párrafo es este endpoint.
     * Una lista de tiendas derivada de los anuncios es una lista de **vendedores que hoy venden**, no
     * un censo. Esto sí: sale de `wallet.ecomerse_sellers`, donde la tienda existe aunque no tenga
     * nada publicado.
     *
     * POR QUÉ DEVUELVE UN OBJETO Y NO UN ARRAY. Con un array no se puede decir «hay 250 tiendas y te
     * estoy dando las 60 primeras» sin que el cliente cuente lo que le llegó y lo confunda con el
     * total. `total` y `anuncios` los cuenta **el servidor sobre todo lo que casa con el filtro**, y
     * `sellers` es la página: el directorio puede escribir la cifra verdadera y, si va recortada,
     * decirlo. (El `LIMIT 200` vuelve a estar aquí, sí — pero ahora es un número que se puede
     * denunciar en pantalla en vez de un techo invisible.)
     *
     * ORDEN = el MISMO del catálogo, para que el directorio no contradiga la rejilla que el comprador
     * acaba de ver: primero las tiendas de pago (rango), después mejor valoradas, después más vistas
     * (`sum(views)` de sus anuncios). Lo que **no** se ordena es por «más anuncios»: es vistoso y
     * falso — no sabemos cuánto vende nadie, y el número de anuncios lo mueve el vendedor en una tarde.
     *
     * FILTROS: `q` (nombre o descripción) y `city`, los dos **sin tildes ni mayúsculas** —los pliega
     * `pliega()`, así que «abaceria» encuentra «Abacería»—, `category`, `sort` (`recommended` por
     * defecto · `rating` · `newest` · `name`) y `limit` (1–200, por defecto 60). Sin paginación por
     * cursor a propósito: el censo con el que se trabaja hoy es de dos cifras y un cursor sin
     * necesidad es un paginador más que se puede romper.
     */
    async sellers(q = {}) {
        if (!FLAG.f1)
            throw new common_1.BadRequestException('Ecomerse no está habilitado (ECOMMERSE_F1_ENABLED=false)');
        const conds = [`s.status='active'`];
        const params = [];
        const P = (v) => { params.push(v); return `$${params.length}`; };
        /* La TIENDA no llega a hoja: elige familia, así que se filtra por departamento o por familia, y
           `category` es el alias viejo de la familia. */
        if (q.department)
            conds.push(`s.department_id = ${P(this.exigirUuid(q.department, 'Departamento inválido'))}::uuid`);
        const famTienda = q.family ?? q.category;
        if (famTienda)
            conds.push(`s.family_id = ${P(this.exigirUuid(famTienda, 'Familia inválida'))}::uuid`);
        if (q.city)
            conds.push(`${pliega('s.city')} LIKE ${pliega(P('%' + q.city + '%'))}`);
        if (q.q)
            conds.push(`(${pliega('s.business_name')} LIKE ${pliega(P('%' + q.q + '%'))} OR ${pliega('s.description')} LIKE ${pliega(P('%' + q.q + '%'))})`);
        /* El límite entra en el SQL como literal: no es entrada del usuario sin tratar, es un entero ya
           acotado aquí. Las tres reglas, dichas: sin `limit` o con algo que no es un número → 60 (la
           página por defecto); un número fuera de rango → al borde más cercano (`limit=9999` da 200,
           `limit=0` o negativo da 1); `limit=1` da 1. Antes `limit=0` caía en el 60 por un `||` — que
           trata el 0 como si no hubiera venido nada — y eso es de las cosas que se leen como un fallo. */
        const pedido = parseInt(q.limit ?? '', 10);
        const limit = Math.min(Math.max(Number.isFinite(pedido) ? pedido : 60, 1), 200);
        const rankExpr = this.rangoDeTienda('s');
        const anunciosExpr = `(SELECT count(*)::int FROM wallet.ecomerse_products p WHERE p.seller_id = s.id AND p.status='active')`;
        const vistasExpr = `(SELECT COALESCE(sum(p.views),0)::int FROM wallet.ecomerse_products p WHERE p.seller_id = s.id AND p.status='active')`;
        const orderBy = (() => {
            switch (q.sort) {
                case 'rating': return `${rankExpr} DESC, s.rating_avg DESC, s.rating_count DESC, s.created_at DESC`;
                case 'newest': return `${rankExpr} DESC, s.created_at DESC`;
                case 'name': return `${rankExpr} DESC, s.business_name ASC`;
                // 'recommended' (por defecto): el orden del catálogo, trasladado de anuncios a tiendas.
                default: return `${rankExpr} DESC, s.rating_avg DESC, ${vistasExpr} DESC, s.created_at DESC`;
            }
        })();
        const where = conds.join(' AND ');
        const rows = await this.prisma.$queryRawUnsafe(`SELECT s.id, s.user_id, s.business_name, s.city, s.phone_contact, s.photo_key, s.description,
              s.rating_avg, s.rating_count, s.created_at,
              ${this.camposDeTienda()},
              ${rankExpr} AS seller_rank,
              ${anunciosExpr} AS anuncios
       FROM wallet.ecomerse_sellers s
       ${this.joinsDeArbol('s')}
       WHERE ${where}
       ORDER BY ${orderBy} LIMIT ${limit}`, ...params);
        /* El recuento va aparte y sin el `LIMIT`: es lo único que puede decir si la página va recortada.
           No lleva el JOIN de categorías porque los filtros solo miran columnas de la tienda. */
        const cuenta = await this.prisma.$queryRawUnsafe(`SELECT count(*)::int AS n, COALESCE(sum(${anunciosExpr}),0)::int AS anuncios
       FROM wallet.ecomerse_sellers s WHERE ${where}`, ...params);
        // Escudo «verificado» solo con KYC real (vive en mobility, el wallet no puede leerla).
        const verified = await this.resolveVerified(rows.map((r) => (r.user_id ? String(r.user_id) : null)));
        return {
            total: Number(cuenta[0]?.n ?? 0),
            anuncios: Number(cuenta[0]?.anuncios ?? 0),
            sellers: rows.map((r) => this.mapTienda(r, verified.get(String(r.user_id)) === true)),
        };
    }
    /**
     * Una tienda suelta: `GET /ecomerse/sellers/:id`. Público.
     *
     * POR QUÉ NO BASTA CON EL CENSO NI CON EL CATÁLOGO. La página de una tienda (`/ecomerse-tienda`)
     * tomaba la tarjeta del **primer anuncio** que encontrara en el catálogo. Dos consecuencias: una
     * tienda activa **sin anuncios activos** se quedaba sin cabecera —sin nombre, sin ciudad, sin
     * escudo, y con un hueco que parece una avería de carga—, y la cabecera dependía del `LIMIT 200`
     * de otro endpoint. La tienda existe aunque hoy no venda; esto la devuelve por sí sola.
     *
     * Una tienda **no activa** (pendiente o rechazada) contesta 404 y no 403: para el comprador no
     * existe, y decir «existe pero no puedes verla» sería contarle algo del vendedor que no es suyo.
     */
    async seller(id) {
        if (!FLAG.f1)
            throw new common_1.BadRequestException('Ecomerse no está habilitado');
        this.idDeTienda(id);
        const rows = await this.prisma.$queryRawUnsafe(`SELECT s.*, ${this.camposDeTienda()},
              ${this.rangoDeTienda('s')} AS seller_rank,
              (SELECT count(*)::int FROM wallet.ecomerse_products p WHERE p.seller_id = s.id AND p.status='active') AS anuncios
       FROM wallet.ecomerse_sellers s
       ${this.joinsDeArbol('s')}
       WHERE s.id=$1::uuid AND s.status='active' LIMIT 1`, id);
        if (!rows[0])
            throw new common_1.NotFoundException('Tienda no encontrada');
        const verificado = (await this.resolveVerified([rows[0].user_id ? String(rows[0].user_id) : null]))
            .get(String(rows[0].user_id)) === true;
        return this.mapTienda(rows[0], verificado);
    }
    /**
     * La TARJETA de una tienda, con **la misma forma** que el `seller` que viaja dentro de cada
     * anuncio (`mapProduct().seller`).
     *
     * No es casualidad: la app pinta las dos con el mismo componente
     * (`components/ecomerse/CabeceraTienda.tsx`), que lee `id`, `businessName`, `ratingAvg`,
     * `ratingCount`, `city`, `phoneContact`, `photoKey`, `userId`, `badge` y `verified`. Si aquí se
     * llamaran distinto, la tarjeta del directorio y la de la ficha se pintarían con campos distintos
     * y una de las dos saldría mintiendo en silencio: avatar «Vendedor», ciudad «—», escudo apagado.
     * Los tres campos que solo se saben mirando la tienda entera —`anuncios`, `categoryLabel`,
     * `description`— se AÑADEN, no sustituyen a nada.
     */
    mapTienda(r, verificado) {
        return {
            id: String(r.id), userId: r.user_id ? String(r.user_id) : null,
            businessName: r.business_name ?? null,
            ratingAvg: Number(r.rating_avg ?? 5), ratingCount: Number(r.rating_count ?? 0),
            city: r.city ?? null, phoneContact: r.phone_contact ?? null,
            photoKey: r.photo_key ?? null,
            badge: Number(r.seller_rank ?? 0) >= 2 ? 'Pro' : null,
            verified: verificado,
            /* La tienda NO llega a hoja: elige familia, y su departamento se deriva de ella. */
            departmentId: r.department_id ? String(r.department_id) : null,
            departmentLabel: r.department_label ?? null, departmentIcon: r.department_icon ?? null,
            familyId: r.family_id ? String(r.family_id) : null,
            familyLabel: r.family_label ?? null,
            categoryLabel: r.family_label ?? r.department_label ?? null,
            categoryIcon: r.department_icon ?? null,
            description: r.description ?? null,
            anuncios: Number(r.anuncios ?? 0),
            createdAt: r.created_at ?? null,
        };
    }
    // ------------------------------------------------------------------ VENDEDOR
    /** Estado del vendedor actual (requisitos + productos). */
    async sellerMe(userId) {
        const kyc = await this.kycOk(userId);
        const rows = await this.prisma.$queryRawUnsafe(`SELECT s.*, ${this.camposDeTienda()} FROM wallet.ecomerse_sellers s
       ${this.joinsDeArbol('s')}
       WHERE s.user_id=$1::uuid LIMIT 1`, userId);
        const products = rows[0] ? await this.prisma.$queryRawUnsafe(`SELECT * FROM wallet.ecomerse_products WHERE seller_id=$1::uuid ORDER BY created_at DESC`, rows[0].id)
            : [];
        return {
            kycOk: kyc.ok,
            kycMessage: kyc.ok ? null : 'Necesitas tener el KYC aprobado (identidad verificada) para vender.',
            seller: rows[0] ? {
                id: String(rows[0].id), businessName: rows[0].business_name,
                departmentId: rows[0].department_id ? String(rows[0].department_id) : null,
                departmentLabel: rows[0].department_label ?? null, departmentIcon: rows[0].department_icon ?? null,
                familyId: rows[0].family_id ? String(rows[0].family_id) : null,
                familyLabel: rows[0].family_label ?? null,
                categoryId: rows[0].family_id ? String(rows[0].family_id) : null,
                categoryLabel: rows[0].family_label ?? rows[0].department_label ?? null,
                description: rows[0].description ?? null,
                city: rows[0].city, phoneContact: rows[0].phone_contact ?? null, photoKey: rows[0].photo_key ?? null,
                status: rows[0].status, rejectionReason: rows[0].rejection_reason ?? null,
                ratingAvg: Number(rows[0].rating_avg), ratingCount: Number(rows[0].rating_count),
                approvedAt: rows[0].approved_at ?? null, createdAt: rows[0].created_at,
            } : null,
            products: products.map((p) => this.mapProduct({ ...p, business_name: rows[0]?.business_name })),
            warrantyDays: WARRANTY_DAYS,
        };
    }
    /** Autoalta: KYC obligatorio + datos del negocio. Nace pending → admin aprueba. */
    async upsertSeller(userId, body) {
        const d = this.parse(ecomerse_dto_1.SellerUpsertSchema, body ?? {});
        const kyc = await this.kycOk(userId);
        if (!kyc.ok)
            throw new common_1.BadRequestException('Requisito: KYC aprobado (identidad verificada). Completa tu verificación primero.');
        /* La tienda elige familia, no hoja: no publica un artículo suelto, así que el último nivel no le
           corresponde. Se valida la familia y que exista. */
        const arbol = await this.resolverArbol(d);
        await this.assertHoja(arbol.departmentId, arbol.familyId, null);
        const existing = await this.prisma.$queryRawUnsafe(`SELECT id, status FROM wallet.ecomerse_sellers WHERE user_id=$1::uuid LIMIT 1`, userId);
        if (existing[0]) {
            if (existing[0].status === 'active') {
                await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_sellers SET business_name=$2, department_id=$3::uuid, family_id=$4::uuid, description=$5, city=$6, phone_contact=$7, photo_key=$8, updated_at=now() WHERE id=$1::uuid`, existing[0].id, d.businessName, arbol.departmentId ?? null, arbol.familyId ?? null, d.description ?? null, d.city, d.phoneContact ?? null, d.photoKey ?? null);
                return { message: 'Perfil de vendedor actualizado', status: 'active' };
            }
            return { message: 'Perfil de vendedor en revisión por el administrador', status: existing[0].status };
        }
        const rows = await this.prisma.$queryRawUnsafe(`INSERT INTO wallet.ecomerse_sellers (user_id, business_name, department_id, family_id, description, city, phone_contact, photo_key, status)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, 'pending')
       RETURNING id, status`, userId, d.businessName, arbol.departmentId ?? null, arbol.familyId ?? null, d.description ?? null, d.city, d.phoneContact ?? null, d.photoKey ?? null);
        return { message: 'Solicitud enviada: el administrador revisará tu negocio', status: rows[0].status, sellerId: String(rows[0].id) };
    }
    // ------------------------------------------------------------------ PRODUCTOS
    /**
     * Publicar producto (solo vendedor ACTIVO). Nace pending → moderación admin.
     *
     * FASE 4 · SKU: los ejes NO entran por aquí (ver `rechazarOpcionesSueltas`). Se crean después,
     * con el anuncio ya existente, por `PUT seller/products/:id/options`. No es una limitación
     * técnica: al crear todavía no hay `product_id` al que colgar los ejes, y las fotos que el
     * comerciante acaba de mandar aún no tienen URL (se suben en este mismo método).
     */
    async createProduct(userId, body) {
        this.rechazarOpcionesSueltas(body, 'POST /ecomerse/products');
        const d = this.parse(ecomerse_dto_1.ProductCreateSchema, body ?? {});
        const seller = await this.requireActiveSeller(userId);
        // Cuota de tienda (monetización v4.2): Gratis 8 / Flash 16 / Pro 32 / Pro Max 100
        const quota = await this.getShopQuota(userId);
        if (quota.limit >= 0 && (await this.countActiveProducts(seller.id)) >= quota.limit) {
            throw new common_1.BadRequestException(`Tu tienda ${quota.name} permite ${quota.limit} producto${quota.limit === 1 ? '' : 's'} activo${quota.limit === 1 ? '' : 's'}. Mejora tu tienda (Flash 2.500, Pro 5.000 o Pro Max 10.000 XAF/mes) para publicar más.`);
        }
        /* El árbol, resuelto y validado ANTES del INSERT: `resolverArbol` traduce los alias viejos y
           deriva el departamento de la familia; `assertHoja` comprueba la cadena entera. Un anuncio con
           una hoja que no es de su familia no se publica. */
        const arbol = await this.resolverArbol(d);
        await this.assertHoja(arbol.departmentId, arbol.familyId, arbol.leafId);
        // Fotos de la app (base64) → URLs de MinIO
        const photos = await this.normalizePhotos(d.photos);
        const rows = await this.prisma.$queryRawUnsafe(`INSERT INTO wallet.ecomerse_products (seller_id, title, description, department_id, family_id, leaf_id, price_xaf, city, photos, stock, status, is_negotiable, attributes, handling_hours, returns_accepted)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7, $8, $9::jsonb, $10, 'pending', $11, $12::jsonb, $13, $14)
       RETURNING id, status`, seller.id, d.title, d.description ?? null, arbol.departmentId ?? null, arbol.familyId ?? null, arbol.leafId ?? null, d.priceXaf, d.city ?? seller.city, JSON.stringify(photos), d.stock, d.isNegotiable, JSON.stringify(d.attributes ?? {}), d.handlingHours, d.returnsAccepted);
        // Documentación (sección 4 del formulario). Se guarda DESPUÉS del anuncio porque necesita su id.
        // No bloquea la publicación: un documento que no sube deja el anuncio sin él, pero no lo tumba.
        await this.guardarDocs(String(rows[0].id), d.docs);
        // Búsqueda por imagen: embedding fire-and-forget (no ralentiza la respuesta)
        if (FLAG.imageSearch && photos[0]) {
            void this.embedProduct(String(rows[0].id), photos[0]).catch(() => undefined);
        }
        return { message: 'Producto enviado a revisión del administrador', productId: String(rows[0].id), status: rows[0].status };
    }
    /**
     * Guarda la documentación de un anuncio (tanda 4 · sección 4).
     *
     * Cómo se sube: igual que las fotos, la imagen llega como dataURL y se sube a MinIO con
     * `normalizePhotos`. Se reutiliza ese método en vez de escribir otro, porque el problema es
     * exactamente el mismo y ya está probado.
     *
     * Idempotencia: UNIQUE (product_id, doc_type). Si el vendedor reenvía una corrección con el
     * mismo tipo de documento, se actualiza la fila y **vuelve a 'pending'**: un documento nuevo
     * no puede heredar la aprobación del anterior.
     */
    async guardarDocs(productId, docs) {
        if (!docs?.length)
            return;
        for (const doc of docs) {
            const urls = await this.normalizePhotos([doc.url]);
            const url = urls[0];
            if (!url)
                continue; // la subida falló: se omite ese documento, no se inventa una URL
            await this.prisma.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_product_docs (product_id, doc_type, url, doc_number, amount_xaf, issued_on, status)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::date, 'pending')
         ON CONFLICT (product_id, doc_type) DO UPDATE
           SET url = EXCLUDED.url, doc_number = EXCLUDED.doc_number,
               amount_xaf = EXCLUDED.amount_xaf, issued_on = EXCLUDED.issued_on,
               status = 'pending', reviewed_by = NULL, reviewed_at = NULL, rejection_reason = NULL`, productId, doc.docType, url, doc.docNumber ?? null, doc.amountXaf ?? null, doc.issuedOn ?? null);
        }
    }
    /** Documentación de un anuncio, para que el comprador la vea y el admin la revise. */
    async productDocs(productId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT id, doc_type, url, doc_number, amount_xaf, issued_on, status, rejection_reason, created_at
         FROM wallet.ecomerse_product_docs WHERE product_id=$1::uuid ORDER BY doc_type`, productId);
        return rows.map((r) => ({
            id: String(r.id), docType: r.doc_type, url: r.url,
            docNumber: r.doc_number ?? null, amountXaf: r.amount_xaf === null ? null : Number(r.amount_xaf),
            issuedOn: r.issued_on ?? null, status: r.status,
            rejectionReason: r.rejection_reason ?? null, createdAt: r.created_at,
        }));
    }
    /**
     * COLA DE MODERACIÓN de documentación (tanda 4, cierre del círculo).
     *
     * Por qué existe: el vendedor sube la factura y el comprador ve «En revisión»… y hasta ahora nadie
     * podía revisarla desde la app: el estado solo se cambiaba con un UPDATE a mano. Una cola sin
     * salida es una promesa al comprador que el sistema no puede cumplir.
     *
     * Trae el documento CON su anuncio y su tienda: quien revisa necesita ver a qué se refiere la
     * factura (título, precio y ciudad) para poder comprobarla. Un listado de documentos sueltos no
     * sirve para decidir.
     */
    async adminDocsPendientes(status) {
        /* El panel quiere enseñar la cola, pero también lo ya revisado (para responder a un vendedor que
           pregunta «¿por qué me lo rechazaste?»). Sin estado se mantiene el comportamiento de siempre:
           solo lo pendiente, que es lo que exige acción. */
        const estados = ['pending', 'approved', 'rejected'];
        const filtro = status && estados.includes(String(status)) ? String(status) : 'pending';
        const rows = await this.prisma.$queryRawUnsafe(`SELECT d.id, d.doc_type, d.url, d.doc_number, d.amount_xaf, d.issued_on, d.status, d.created_at,
              d.rejection_reason,
              p.id AS product_id, p.title AS product_title, p.price_xaf AS product_price, p.city AS product_city,
              s.business_name
         FROM wallet.ecomerse_product_docs d
         JOIN wallet.ecomerse_products p ON p.id = d.product_id
         JOIN wallet.ecomerse_sellers s ON s.id = p.seller_id
        WHERE d.status=$1
        ORDER BY d.created_at ASC
        LIMIT 200`, filtro);
        return rows.map((r) => ({
            id: String(r.id), docType: r.doc_type, url: r.url,
            docNumber: r.doc_number ?? null,
            amountXaf: r.amount_xaf === null ? null : Number(r.amount_xaf),
            issuedOn: r.issued_on ?? null, status: r.status, createdAt: r.created_at,
            rejectionReason: r.rejection_reason ?? null,
            producto: {
                id: String(r.product_id), title: r.product_title, priceXaf: Number(r.product_price),
                city: r.product_city, sellerName: r.business_name ?? null,
            },
        }));
    }
    /** Contadores por estado, para las tarjetas de resumen del panel. */
    async adminDocStats() {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT status, COUNT(*)::int AS n
         FROM wallet.ecomerse_product_docs GROUP BY status`);
        const porEstado = { pending: 0, approved: 0, rejected: 0 };
        /* El total se SUMA de lo que hay, no de los tres estados que yo conozco: si algun dia entra un
           estado nuevo, un total calculado a mano lo escondería y el panel diría menos de lo que hay. */
        let total = 0;
        for (const r of rows) {
            const n = Number(r.n);
            porEstado[String(r.status)] = n;
            total += n;
        }
        return { ...porEstado, total };
    }
    /**
     * Aprueba o rechaza un documento. El revisor se toma del token (lo pasa el controlador), nunca del
     * cuerpo: si el cliente pudiera decir quién revisa, la trazabilidad no valdría nada.
     */
    async adminDecideDoc(adminId, docId, body) {
        const d = this.parse(ecomerse_dto_1.ProductDocDecisionSchema, body ?? {});
        // Un «no» sin motivo deja al vendedor sin saber qué corregir: se exige.
        if (!d.approve && !(d.reason ?? '').trim()) {
            throw new common_1.BadRequestException('Al rechazar hay que decir el motivo: el vendedor lo verá.');
        }
        /* Se calcula en una variable con tipo explícito: `d.approve ? null : d.reason!.trim()` daba
           «Object is possibly null» al compilar en el servidor (lo cazó la vuelta atrás del despliegue,
           no mi `tsc` local, porque el backend no está en el tsconfig de la app). */
        const motivoRechazo = d.approve ? null : (d.reason ?? '').trim();
        const rows = await this.prisma.$queryRawUnsafe(`UPDATE wallet.ecomerse_product_docs
          SET status = $2, reviewed_by = $3::uuid, reviewed_at = now(), rejection_reason = $4
        WHERE id = $1::uuid AND status = 'pending'
        RETURNING id, doc_type, status`, docId, d.approve ? 'approved' : 'rejected', adminId, motivoRechazo);
        // Si no hay fila: o no existe, o ya la había revisado otro. Se distingue para no mentir.
        if (!rows[0]) {
            const existe = await this.prisma.$queryRawUnsafe(`SELECT status FROM wallet.ecomerse_product_docs WHERE id=$1::uuid`, docId);
            if (!existe[0])
                throw new common_1.NotFoundException('Documento no encontrado');
            throw new common_1.BadRequestException(`Ese documento ya estaba revisado (${existe[0].status}).`);
        }
        return { message: d.approve ? 'Documento aprobado' : 'Documento rechazado', doc: rows[0] };
    }
    async updateProduct(userId, productId, body) {
        this.rechazarOpcionesSueltas(body, 'PUT /ecomerse/products/:id');
        const d = this.parse(ecomerse_dto_1.ProductUpdateSchema, body ?? {});
        const seller = await this.requireActiveSeller(userId);
        const rows = await this.prisma.$queryRawUnsafe(`SELECT * FROM wallet.ecomerse_products WHERE id=$1::uuid AND seller_id=$2::uuid LIMIT 1`, productId, seller.id);
        if (!rows[0])
            throw new common_1.NotFoundException('Producto no encontrado');
        if (rows[0].status !== 'draft' && rows[0].status !== 'rejected') {
            throw new common_1.BadRequestException('Solo se editan productos en borrador o rechazados');
        }
        /* FASE 4 · SKU: la misma regla que en el carril rápido — con combinaciones, las existencias del
           anuncio son el espejo de su suma y no se escriben a mano. Vale igual en borrador: un borrador
           ya puede tener sus combinaciones puestas. */
        if (d.stock !== undefined) {
            const n = (await this.contarVariantes(this.prisma, [productId])).get(productId) ?? 0;
            if (n > 0) {
                throw new common_1.BadRequestException(`Este anuncio se vende por combinaciones (${n}): sus existencias son la suma de ellas. `
                    + 'Cambia las de cada combinación (Color · Talla), no las del anuncio.');
            }
        }
        /* El árbol que va a quedar: lo que trae el cuerpo y, si no, lo que ya tenía el anuncio. Se
           resuelve ANTES de validar porque `assertHoja` comprueba la cadena entera: validar solo lo que
           viene en el cuerpo dejaría pasar un cambio de familia que deja colgando la hoja vieja. */
        const arbol = await this.resolverArbol(d);
        const finalDep = arbol.departmentId !== undefined ? arbol.departmentId : (rows[0].department_id ? String(rows[0].department_id) : null);
        const finalFam = arbol.familyId !== undefined ? arbol.familyId : (rows[0].family_id ? String(rows[0].family_id) : null);
        const finalHoja = arbol.leafId !== undefined ? arbol.leafId : (rows[0].leaf_id ? String(rows[0].leaf_id) : null);
        await this.assertHoja(finalDep, finalFam, finalHoja);
        const set = ['updated_at=now()', 'status=\'pending\'', 'rejection_reason=NULL'];
        const args = [];
        if (d.title !== undefined) {
            set.push(`title=$${args.length + 1}`);
            args.push(d.title);
        }
        if (d.description !== undefined) {
            set.push(`description=$${args.length + 1}`);
            args.push(d.description);
        }
        if (d.priceXaf !== undefined) {
            set.push(`price_xaf=$${args.length + 1}`);
            args.push(d.priceXaf);
        }
        if (d.photos !== undefined) {
            set.push(`photos=$${args.length + 1}::jsonb`);
            args.push(JSON.stringify(d.photos));
        }
        if (d.city !== undefined) {
            set.push(`city=$${args.length + 1}`);
            args.push(d.city);
        }
        if (d.stock !== undefined) {
            set.push(`stock=$${args.length + 1}`);
            args.push(d.stock);
        }
        /* Las tres columnas del árbol. Cuando cambia la familia se escribe TAMBIÉN el departamento,
           resuelto de ella: si no, la fila quedaría con una familia de una rama y el departamento de
           otra, y el anuncio desaparecería del árbol sin que nada avise. */
        if (arbol.familyId !== undefined) {
            set.push(`department_id=$${args.length + 1}::uuid`);
            args.push(finalDep);
            set.push(`family_id=$${args.length + 1}::uuid`);
            args.push(arbol.familyId ?? null);
        }
        else if (arbol.departmentId !== undefined) {
            set.push(`department_id=$${args.length + 1}::uuid`);
            args.push(arbol.departmentId ?? null);
        }
        if (arbol.leafId !== undefined) {
            set.push(`leaf_id=$${args.length + 1}::uuid`);
            args.push(arbol.leafId ?? null);
        }
        if (d.attributes !== undefined) {
            set.push(`attributes=$${args.length + 1}::jsonb`);
            args.push(JSON.stringify(d.attributes));
        }
        if (d.handlingHours !== undefined) {
            set.push(`handling_hours=$${args.length + 1}`);
            args.push(d.handlingHours);
        }
        if (d.returnsAccepted !== undefined) {
            set.push(`returns_accepted=$${args.length + 1}`);
            args.push(d.returnsAccepted);
        }
        let finalPhotos = rows[0].photos ?? [];
        if (d.photos !== undefined) {
            finalPhotos = await this.normalizePhotos(d.photos);
            set.push(`photos=$${args.length + 1}::jsonb`);
            args.push(JSON.stringify(finalPhotos));
        }
        args.push(productId);
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_products SET ${set.join(', ')} WHERE id=$${args.length}::uuid`, ...args);
        // Documentación: mismo camino que al crear (el anuncio ya existe, así que hay id).
        await this.guardarDocs(productId, d.docs);
        if (FLAG.imageSearch && finalPhotos?.[0]) {
            void this.embedProduct(productId, finalPhotos[0]).catch(() => undefined);
        }
        return { message: 'Producto actualizado y enviado a revisión' };
    }
    /**
     * CARRIL RÁPIDO · OPERACIÓN del anuncio (existencias, plazo, devoluciones).
     *
     * POR QUÉ EXISTE: el único camino de edición (`updateProduct`) exige `draft|rejected` y reescribe
     * `status='pending'`. Es decir, **un anuncio activo era inmutable**: para reponer existencias había
     * que despublicarlo y mandarlo otra vez a revisión, y con la moderación tardando 24–48 h, reponer
     * el stock significaba perder dos días de ventas. La moderación existe para decidir si algo puede
     * estar publicado; cuántas unidades hay no es una decisión de contenido.
     *
     * LO QUE **NO** HACE, a propósito: no toca título, descripción, fotos, precio, categoría ni
     * atributos de identidad. Eso sigue volviendo a revisión por `updateProduct` — es lo que el
     * moderador juzgó, y cambiarlo por debajo invalidaría su aprobación.
     *
     * ACOPLAMIENTO EXISTENCIAS ↔ ESTADO: `stock` es un hecho y `status` su consecuencia.
     *   · 0 y estaba `active`  → `sold_out`  (mismo criterio que el decremento de `createOrder`,
     *     que hace `status=CASE WHEN stock-$2<=0 THEN 'sold_out' ELSE status END`: si se hiciera
     *     distinto, el mismo hecho dejaría el anuncio en dos estados según quién lo tocara)
     *   · >0 y estaba `sold_out` → `active`  (reponer devuelve el anuncio a la venta; el caso
     *     principal de esta ruta)
     * En cualquier otro estado (pending, draft, rejected, paused) el stock cambia y el estado no:
     * un anuncio pausado con existencias sigue pausado, porque pausar fue una decisión del vendedor.
     */
    async updateProductOperations(userId, productId, body) {
        const d = this.parse(ecomerse_dto_1.ProductOperationsSchema, body ?? {});
        const seller = await this.requireActiveSeller(userId);
        const rows = await this.prisma.$queryRawUnsafe(`SELECT id, status, stock FROM wallet.ecomerse_products WHERE id=$1::uuid AND seller_id=$2::uuid LIMIT 1`, productId, seller.id);
        if (!rows[0])
            throw new common_1.NotFoundException('Producto no encontrado');
        const actual = rows[0];
        /* Retirado es el único estado que bloquea: si no está en el catálogo, cambiar sus existencias no
           significa nada. Se dice qué hacer en vez de un «no se puede» seco. */
        if (actual.status === 'removed') {
            throw new common_1.BadRequestException('Este anuncio está retirado. Vuelve a ponerlo a la venta antes de cambiar sus existencias.');
        }
        /* FASE 4 · SKU: con combinaciones, `stock` NO se escribe a mano en el anuncio — es el ESPEJO de
           la suma de las combinaciones (`espejarStock`). Aceptarlo aquí crearía dos verdades: el
           vendedor pondría 50 en el anuncio, las combinaciones seguirían agotadas, y la tarjeta
           anunciaría 50 unidades de algo que no se puede comprar. Se dice dónde se cambia, en vez de
           aceptarlo y que la ficha mienta. */
        if (d.stock !== undefined) {
            const n = (await this.contarVariantes(this.prisma, [productId])).get(productId) ?? 0;
            if (n > 0) {
                throw new common_1.BadRequestException(`Este anuncio se vende por combinaciones (${n}): sus existencias son la suma de ellas. `
                    + 'Cambia las de cada combinación (Color · Talla), no las del anuncio.');
            }
        }
        const set = ['updated_at=now()'];
        const args = [];
        if (d.stock !== undefined) {
            set.push(`stock=$${args.length + 1}`);
            args.push(d.stock);
        }
        if (d.handlingHours !== undefined) {
            set.push(`handling_hours=$${args.length + 1}`);
            args.push(d.handlingHours);
        }
        if (d.returnsAccepted !== undefined) {
            set.push(`returns_accepted=$${args.length + 1}`);
            args.push(d.returnsAccepted);
        }
        let nuevoEstado = null;
        if (d.stock !== undefined) {
            if (d.stock === 0 && actual.status === 'active')
                nuevoEstado = 'sold_out';
            else if (d.stock > 0 && actual.status === 'sold_out')
                nuevoEstado = 'active';
        }
        if (nuevoEstado) {
            set.push(`status=$${args.length + 1}`);
            args.push(nuevoEstado);
        }
        args.push(productId);
        const upd = await this.prisma.$queryRawUnsafe(`UPDATE wallet.ecomerse_products SET ${set.join(', ')} WHERE id=$${args.length}::uuid
       RETURNING id, stock, status, handling_hours, returns_accepted`, ...args);
        const r = upd[0];
        return {
            message: nuevoEstado === 'sold_out'
                ? 'Sin existencias: el anuncio queda como agotado'
                : nuevoEstado === 'active'
                    ? 'Existencias repuestas: el anuncio vuelve a la venta'
                    : 'Anuncio actualizado',
            producto: {
                id: String(r.id), stock: Number(r.stock), status: r.status,
                handlingHours: Number(r.handling_hours), returnsAccepted: r.returns_accepted,
            },
        };
    }
    /**
     * CARRIL RÁPIDO · ESTADO de publicación (activar, pausar, retirar).
     *
     * POR QUÉ EXISTE: `paused` estaba **en la app y no en la base** — `ecomerse-seller.tsx:27` ya
     * traducía `paused: 'Pausada'` y ninguna ruta podía escribir ese estado (etiqueta muerta). Y borrar
     * un anuncio no existía: el controlador no tiene `@Delete` de productos, así que lo único posible
     * era dejarlo publicado para siempre.
     *
     * LAS TRES REGLAS QUE NO SE REABREN SIN MOTIVO:
     *  1. **`active` no se alcanza desde `pending`/`draft`/`rejected`.** Este carril no modera: si
     *     activar valiera desde `pending`, cualquiera saltaría la revisión con un PATCH y la moderación
     *     entera sería decorativa. Se rechaza con el motivo y con la salida (corregir y reenviar).
     *  2. **Activar con 0 existencias deja el anuncio `sold_out`, no `active`.** Poner a la venta algo
     *     que no se puede entregar es peor que no venderlo: el comprador paga y luego no hay género.
     *  3. **`removed` es reversible y no borra.** La retirada no destruye el anuncio —fotos, documentos
     *     y atributos siguen ahí—, porque un toque equivocado tiene que poder deshacerse. Y no se
     *     inventa un `DELETE`: las valoraciones, los documentos y las líneas de pedido apuntan a este
     *     id (FK con CASCADE en varias tablas), y borrar de verdad se llevaría por delante el historial
     *     de las ventas ya hechas.
     */
    async updateProductState(userId, productId, body) {
        const d = this.parse(ecomerse_dto_1.ProductStateSchema, body ?? {});
        const seller = await this.requireActiveSeller(userId);
        const rows = await this.prisma.$queryRawUnsafe(`SELECT id, status, stock FROM wallet.ecomerse_products WHERE id=$1::uuid AND seller_id=$2::uuid LIMIT 1`, productId, seller.id);
        if (!rows[0])
            throw new common_1.NotFoundException('Producto no encontrado');
        const actual = rows[0];
        if (d.state === 'active' && ['pending', 'draft', 'rejected'].includes(String(actual.status))) {
            throw new common_1.BadRequestException(actual.status === 'rejected'
                ? 'Un anuncio rechazado no se pone a la venta: corrígelo (se reenvía a revisión) y espera la aprobación.'
                : 'Este anuncio todavía no está aprobado: ponlo a la venta cuando el administrador lo apruebe.');
        }
        let destino = d.state;
        if (destino === 'active' && Number(actual.stock) <= 0)
            destino = 'sold_out';
        if (destino === actual.status) {
            return {
                message: destino === 'paused' ? 'El anuncio ya estaba pausado'
                    : destino === 'removed' ? 'El anuncio ya estaba retirado'
                        : 'El anuncio ya estaba a la venta',
                sinCambio: true,
                producto: { id: String(actual.id), stock: Number(actual.stock), status: String(actual.status) },
            };
        }
        const upd = await this.prisma.$queryRawUnsafe(`UPDATE wallet.ecomerse_products SET status=$1, updated_at=now()
        WHERE id=$2::uuid AND seller_id=$3::uuid
      RETURNING id, stock, status`, destino, productId, seller.id);
        const r = upd[0];
        return {
            message: destino === 'paused' ? 'Anuncio pausado: ya no aparece en el Mercado'
                : destino === 'removed' ? 'Anuncio retirado del catálogo'
                    : destino === 'sold_out' ? 'Anuncio a la venta, pero sin existencias: aparece como agotado'
                        : 'Anuncio a la venta',
            producto: { id: String(r.id), stock: Number(r.stock), status: r.status },
        };
    }
    // ------------------------------------------------- EJES Y COMBINACIONES (Fase 4 · SKU)
    /**
     * Los ejes y las combinaciones de un anuncio, para el SELECTOR del comprador.
     *
     * Público (como la ficha): el selector necesita saber qué se puede comprar y qué está agotado
     * ANTES de comprar. Devuelve `{ options: [], variants: [] }` en un anuncio sin ejes, que es
     * exactamente lo que la app espera para no pintar nada.
     */
    async productOptions(productId) {
        this.idDeProducto(productId);
        return this.opciones.leer(this.prisma, productId);
    }
    /**
     * Comprueba que un id de anuncio tenga FORMA de uuid antes de que llegue a la base.
     *
     * POR QUÉ EXISTE (medido el 21-sep-2026): `GET /api/ecomerse/products/1` respondía **500**
     * —`22P02 invalid input syntax for type uuid: "1"`— y dejaba un `[unhandled]
     * PrismaClientKnownRequestError` en el log de errores en cada intento. Un id mal formado no es un
     * fallo del servidor: es una petición mal hecha, y lo que corresponde es un 400 que lo diga.
     * Además, ese ruido envenena la lectura del log: quien busca el error de verdad tiene que
     * descartar antes cien líneas que nadie va a arreglar.
     *
     * Va como método —y no repetido en cada ruta— para que las dos lecturas de producto no puedan
     * aceptar formas distintas; y se aplica SOLO a las rutas nuevas y a la ficha, no a todas las del
     * módulo: las demás tienen exactamente el mismo defecto y se arreglan en su propia tanda, cuando
     * se pueda revisar quién llama a cada una.
     */
    idDeProducto(id) {
        this.exigirUuid(id, 'Producto inválido');
    }
    /** Lo mismo para una tienda. Lo usan el censo (`GET /ecomerse/sellers/:id`) y su filtro. */
    idDeTienda(id) {
        this.exigirUuid(id, 'Tienda inválida');
    }
    /**
     * El id de la URL, o un 400 que lo dice. Devuelve el id ya normalizado a `string` para que quien
     * lo llame pueda usarlo como parámetro del SQL en la misma línea: `this.exigirUuid(q.category, …)`
     * no puede ir a la consulta sin pasar por aquí.
     *
     * El mensaje se pasa entero —«Tienda inválida», no «Tienda» + «inválido»— porque el texto sale en
     * la respuesta al usuario y una concordancia rota («Tienda inválido») se lee como un descuido.
     */
    exigirUuid(id, mensaje) {
        const v = String(id ?? '');
        if (!UUID_RE.test(v))
            throw new common_1.BadRequestException(mensaje);
        return v;
    }
    /**
     * El comerciante guarda los ejes y las combinaciones de SU anuncio.
     *
     * POR QUÉ VIVE EN EL CARRIL RÁPIDO y no en `PUT products/:id`: el precio y el stock de cada
     * combinación («Rojo · M: 3 unidades») se corrige en el día a día. Pasarlo por moderación
     * significaría volver a la cola 24–48 h cada vez que se repone una talla. Qué NO se puede colar
     * por aquí: ni el `status` (no activa nada, no salta la moderación) ni el anuncio de otro
     * vendedor (`requireActiveSeller` + `WHERE seller_id`, que devuelve «no encontrado»).
     *
     * LA REGLA DE EXISTENCIAS, en una frase: **en un anuncio con combinaciones, las existencias son
     * la SUMA de las combinaciones.** `wallet.ecomerse_products.stock` pasa a ser un ESPEJO de esa
     * suma (ver `espejarStock`), y por eso deja de escribirse a mano (`updateProductOperations` lo
     * rechaza). Sin espejo, la tarjeta del Mercado seguiría diciendo «quedan 12» con las doce
     * combinaciones agotadas — y la tarjeta es lo que se ve antes de entrar.
     *
     * QUÉ NO HACE, a propósito: no avisa a quien esperaba reposición (esa tabla es de `lifebook`; en
     * Ecomerse no existe y el módulo compartido no la conoce) y no toca el precio del anuncio.
     */
    async setProductOptions(userId, productId, body) {
        this.idDeProducto(productId);
        const d = this.parse(ecomerse_dto_1.ProductOptionsSchema, body ?? {});
        const seller = await this.requireActiveSeller(userId);
        const rows = await this.prisma.$queryRawUnsafe(`SELECT id, title, photos, stock, status FROM wallet.ecomerse_products
        WHERE id=$1::uuid AND seller_id=$2::uuid LIMIT 1`, productId, seller.id);
        if (!rows[0])
            throw new common_1.NotFoundException('Producto no encontrado');
        const producto = rows[0];
        /* Las fotos de ESTE producto: un eje de color solo puede llevar una foto que sea suya. Se
           resuelven aquí —y no en el módulo compartido— porque cada mercado llama distinto a su columna
           (`media` en lifebook, `photos` en ecomerse) y el módulo no tiene por qué saberlo. */
        const fotos = (0, opciones_producto_1.recolectarFotos)(producto.photos);
        /* Si la app NO manda combinaciones, se comparan los ejes nuevos contra las combinaciones que ya
           existen: así no se pueden guardar unos ejes que no encajen con lo que se está vendiendo
           (dejar «Rojo · M» sin el eje «color» la convertiría en una fila inalcanzable con stock dentro). */
        let variantes = d.variants ?? null;
        if (!variantes) {
            const actuales = await this.opciones.leerVariantes(this.prisma, productId);
            variantes = actuales.map((v) => ({ name: v.name, attributes: v.attributes ?? {} }));
        }
        const grupos = this.opciones.preparar(d.options, fotos);
        this.opciones.validarCombinaciones(grupos, variantes);
        await this.prisma.$transaction(async (tx) => {
            await this.opciones.escribir(tx, productId, grupos);
            if (Array.isArray(d.variants)) {
                await this.opciones.escribirCombinaciones(tx, productId, grupos, d.variants);
            }
            await this.espejarStock(tx, productId);
        });
        const { options, variants } = await this.opciones.leer(this.prisma, productId);
        const stock = await this.stockDelAnuncio(productId);
        return {
            /* El plural, escrito entero: `combinación` + «es» da «combinaciónes», que no existe. Un
               mensaje que el comerciante lee no puede llevar una falta de ortografía en el sustantivo
               clave de la pantalla. */
            message: options.length
                ? `Guardado: ${options.length === 1 ? '1 eje' : options.length + ' ejes'} y `
                    + (variants.length === 1 ? '1 combinación' : `${variants.length} combinaciones`)
                : 'Guardado: este anuncio ya no tiene combinaciones',
            options, variants, stock,
        };
    }
    /**
     * `wallet.ecomerse_products.stock` = la SUMA de las combinaciones. Un solo sitio lo calcula.
     *
     * Se DERIVA del origen (las combinaciones) en vez de ir sumando y restando el anuncio en paralelo:
     * dos contadores que se actualizan por caminos distintos se separan el día que alguien añade un
     * camino nuevo, y entonces la tarjeta miente. Aquí, si el espejo se quedara atrás, el siguiente
     * cambio de combinaciones lo corrige.
     *
     * El estado se acopla con la MISMA regla que ya usa el carril rápido de existencias
     * (`updateProductOperations`), y no con una parecida: `stock=0` y estaba a la venta → `sold_out`;
     * hay stock y estaba `sold_out` → `active`. Si se hiciera distinto, el mismo hecho dejaría el
     * anuncio en dos estados según quién lo tocara — que es exactamente el defecto que ese método
     * documenta. **Nunca devuelve a la venta desde `pending`/`paused`/`removed`**: reponer no es
     * moderar ni des-pausar, y esas decisiones son de otro carril.
     *
     * SOLO ACTÚA SI EL ANUNCIO TIENE COMBINACIONES (`AND EXISTS …`), y eso no es un detalle: sin esa
     * condición, guardar `options: []` —el comerciante quita los ejes— dejaría el anuncio a 0 y
     * agotado, porque la suma de CERO combinaciones es 0. Y ese 0 no significa «no queda género»:
     * significa «aquí ya no hay nada que sumar». Sin combinaciones, `stock` vuelve a ser lo que era —
     * un número que el comerciante escribe a mano en el carril de existencias.
     */
    async espejarStock(db, productId) {
        await db.$executeRawUnsafe(`UPDATE wallet.ecomerse_products p SET
         stock = COALESCE((SELECT sum(v.stock_quantity) FROM wallet.ecomerse_product_variants v WHERE v.product_id = p.id), 0),
         status = CASE
           WHEN COALESCE((SELECT sum(v.stock_quantity) FROM wallet.ecomerse_product_variants v WHERE v.product_id = p.id), 0) <= 0
                AND p.status IN ('active','sold_out') THEN 'sold_out'
           WHEN COALESCE((SELECT sum(v.stock_quantity) FROM wallet.ecomerse_product_variants v WHERE v.product_id = p.id), 0) > 0
                AND p.status = 'sold_out' THEN 'active'
           ELSE p.status END,
         updated_at = now()
       WHERE p.id = $1::uuid
         AND EXISTS (SELECT 1 FROM wallet.ecomerse_product_variants v WHERE v.product_id = p.id)`, productId);
    }
    /**
     * Devuelve al stock lo que reservó una línea del pedido, al cancelar o al caducar.
     *
     * POR QUÉ ES UN MÉTODO Y NO DOS BLOQUES IGUALES: la reposición está escrita en el camino de
     * cancelación y en el del barrido de caducidad, y los dos tienen que saber lo MISMO — que una
     * línea con combinación devuelve su unidad a LA COMBINACIÓN, no al anuncio. Si el barrido se
     * quedara con la versión antigua (sumar al anuncio), el `stock` del anuncio —que es el espejo de
     * la suma— crecería por encima de la verdad y la tarjeta volvería a anunciar unidades que no
     * existen. Un solo sitio, un solo criterio.
     */
    async reponerLinea(db, it) {
        if (!it?.productId)
            return;
        const qty = Number(it.qty ?? 1);
        if (it.variantId) {
            await db.$executeRawUnsafe(`UPDATE wallet.ecomerse_product_variants SET stock_quantity = stock_quantity + $2
          WHERE id=$1::uuid AND product_id=$3::uuid`, String(it.variantId), qty, String(it.productId));
            await this.espejarStock(db, String(it.productId));
            return;
        }
        await db.$executeRawUnsafe(`UPDATE wallet.ecomerse_products SET stock=stock+$2,
         status=CASE WHEN status='sold_out' THEN 'active' ELSE status END, updated_at=now()
       WHERE id=$1::uuid`, String(it.productId), qty);
    }
    /** Las existencias del anuncio, tal como las ve la tarjeta. */
    async stockDelAnuncio(productId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT stock FROM wallet.ecomerse_products WHERE id=$1::uuid`, productId);
        return Number(rows[0]?.stock ?? 0);
    }
    /**
     * Cuántas combinaciones tiene el anuncio — y, de paso, si tiene alguna.
     *
     * Se pregunta por las COMBINACIONES y no por los ejes porque es lo que de verdad cambia el
     * contrato de compra: se puede tener un eje guardado sin ninguna combinación escrita (el
     * comerciante está a medias), y en ese caso el anuncio se compra como siempre.
     */
    async contarVariantes(db, productIds) {
        const cuenta = new Map();
        if (!productIds.length)
            return cuenta;
        const filas = await db.$queryRawUnsafe(`SELECT product_id, count(*)::int AS n FROM wallet.ecomerse_product_variants
        WHERE product_id = ANY($1::uuid[]) GROUP BY product_id`, productIds);
        for (const f of filas)
            cuenta.set(String(f.product_id), Number(f.n ?? 0));
        return cuenta;
    }
    /**
     * Los ejes y las combinaciones NO entran por el carril moderado (`POST`/`PUT products`).
     *
     * Por qué se rechaza en vez de ignorarse: Zod descarta en silencio las claves que no conoce, así
     * que un `options` colado en el cuerpo de publicación **no daría error y no se guardaría nada**.
     * El comerciante creería haber publicado sus tallas y vería el anuncio sin ellas. Un error que
     * dice dónde sí se guardan cuesta un segundo; el silencio cuesta una tarde.
     */
    rechazarOpcionesSueltas(body, donde) {
        if (body && (body.options !== undefined || body.variants !== undefined)) {
            throw new common_1.BadRequestException(`Los ejes y las combinaciones no se guardan en ${donde}: usa PUT /ecomerse/seller/products/:id/options `
                + '(van por el carril rápido, para que reponer una talla no devuelva el anuncio a revisión)');
        }
    }
    /**
     * LAS PIEZAS DEL ÁRBOL QUE TRAE UN CUERPO, resueltas. Hace dos cosas a la vez:
     *
     *   · LOS ALIAS VIEJOS. La app instalada manda `categoryId` / `subcategoryId`, y no son nombres
     *     sueltos: en el árbol viejo eran «el nivel de arriba» y «el de abajo», y de las 21 categorías
     *     viejas han salido las FAMILIAS y de las 134 subcategorías las HOJAS. El alias es literal.
     *     El nombre nuevo manda si vienen los dos, y `undefined` es «no lo toques» — que NO es lo
     *     mismo que `null`, que es «bórralo»; confundir los dos borra la categoría de un anuncio cada
     *     vez que alguien edita solo el precio.
     *
     *   · EL DEPARTAMENTO, DERIVADO. Si llega la familia y no llega el departamento —lo normal: la app
     *     elige familia y el departamento ya lo conoce de la pantalla anterior—, se lee de la familia.
     *     Sin esto, cambiar de familia dejaría el anuncio con una familia de una rama y el
     *     departamento de otra, y ese anuncio no aparece en ninguna parte del árbol.
     */
    async resolverArbol(d) {
        const familia = d.familyId !== undefined ? d.familyId : d.categoryId;
        const hoja = d.leafId !== undefined ? d.leafId : d.subcategoryId;
        let departamento = d.departmentId;
        if (departamento === undefined && familia) {
            const f = await this.prisma.$queryRawUnsafe(`SELECT department_id FROM wallet.ecomerse_families WHERE id=$1::uuid`, familia);
            departamento = f[0]?.department_id ? String(f[0].department_id) : undefined;
        }
        return { departmentId: departamento, familyId: familia, leafId: hoja };
    }
    /**
     * Valida la PERTENENCIA EN CADENA: la hoja tiene que estar en la familia, y la familia en el
     * departamento.
     *
     * Antes esto se llamaba `assertSubcategory` y solo miraba que la subcategoría existiera y colgara
     * de su categoría. Con tres niveles hay un escalón más, y saltárselo deja pasar combinaciones
     * imposibles —una hoja de «Alimentación» publicada bajo «Ordenadores»— que no dan error en
     * ninguna parte: el anuncio se guarda, sale en el catálogo, y en el árbol no está. Es el tipo de
     * fallo que no se ve hasta que alguien busca su propio anuncio y no lo encuentra.
     */
    async assertHoja(departmentId, familyId, leafId) {
        if (familyId) {
            const fam = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_families WHERE id=$1::uuid AND active=true`, familyId);
            if (!fam[0])
                throw new common_1.BadRequestException('Familia inválida');
        }
        if (!leafId)
            return;
        const rows = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_leaves WHERE id=$1::uuid AND active=true`, leafId);
        if (!rows[0])
            throw new common_1.BadRequestException('Hoja de categoría inválida');
        if (familyId) {
            const check = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_leaves WHERE id=$1::uuid AND family_id=$2::uuid`, leafId, familyId);
            if (!check[0])
                throw new common_1.BadRequestException('La hoja elegida no pertenece a la familia');
        }
        if (departmentId) {
            const check = await this.prisma.$queryRawUnsafe(`SELECT l.id FROM wallet.ecomerse_leaves l
           JOIN wallet.ecomerse_families f ON f.id = l.family_id
          WHERE l.id=$1::uuid AND f.department_id=$2::uuid`, leafId, departmentId);
            if (!check[0])
                throw new common_1.BadRequestException('La hoja elegida no pertenece al departamento');
        }
    }
    /** Fotos de la app (dataURL base64) → URLs públicas en MinIO. Las URLs ya
     *  existentes se dejan igual (idempotente al re-publicar). */
    async normalizePhotos(photos) {
        const out = [];
        for (const ph of photos ?? []) {
            if (ph.startsWith('data:image/')) {
                const url = await this.storage.putImage(ph, 'products');
                if (url)
                    out.push(url);
            }
            else if (/^https?:\/\//.test(ph)) {
                out.push(ph);
            }
        }
        return out;
    }
    async myProducts(userId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT p.*, s.business_name FROM wallet.ecomerse_products p
       JOIN wallet.ecomerse_sellers s ON s.id = p.seller_id
       WHERE s.user_id=$1::uuid ORDER BY p.created_at DESC`, userId);
        /* FASE 4 · SKU: el vendedor necesita saber de un vistazo qué anuncios se venden por combinación,
           porque en esos el stock NO se edita en el anuncio (ver `updateProductOperations`). Se cuenta en
           UNA consulta para todos los anuncios del vendedor, no una por anuncio: su lista es corta, pero
           el patrón «una consulta por fila» es el que se descontrola cuando la lista crece. */
        const cuenta = await this.contarVariantes(this.prisma, rows.map((r) => String(r.id)));
        return rows.map((r) => ({ ...this.mapProduct(r), variantCount: cuenta.get(String(r.id)) ?? 0 }));
    }
    // ------------------------------------------------------------------ UPLOAD DE FOTOS (multipart)
    /** Sube una foto (archivo multipart) a MinIO y devuelve la URL pública. */
    async uploadPhoto(file) {
        if (!file?.buffer?.length)
            throw new common_1.BadRequestException('Imagen requerida (campo multipart "photo")');
        const url = await this.storage.putImageBuffer(file.buffer, file.mimetype ?? 'image/jpeg', 'products');
        if (!url)
            throw new common_1.BadRequestException('No se pudo guardar la imagen. Prueba con un archivo menor de 8 MB.');
        return { url };
    }
    // ------------------------------------------------------------------ PEDIDOS
    /** Crea pedido(s): stock ATÓMICO (FOR UPDATE en transacción), MULTI-LÍNEA y
     *  MULTI-VENDEDOR (una orden por vendedor), idempotente por key, tarifa
     *  logística única (primer pedido si hay agente). Auditoría + SMS. */
    async createOrder(userId, body, paymentToken) {
        const d = this.parse(ecomerse_dto_1.OrderCreateSchema, body ?? {});
        const items = d.items?.length
            ? d.items.map((i) => ({
                productId: String(i.productId),
                qty: Math.max(1, Number(i.qty ?? 1)),
                variantId: i.variantId ? String(i.variantId) : null,
            }))
            : d.productId
                ? [{ productId: d.productId, qty: d.qty, variantId: d.variantId ? String(d.variantId) : null }]
                : [];
        if (items.length === 0)
            throw new common_1.BadRequestException('Selecciona al menos un producto');
        if (items.length > 10)
            throw new common_1.BadRequestException('Máximo 10 productos por pedido');
        const allIds = [...new Set(items.map((i) => i.productId))];
        // Idempotencia: si la key ya se usó, devolver la(s) orden(es) existente(s)
        if (d.idempotencyKey) {
            const existing = await this.prisma.$queryRawUnsafe(`SELECT o.*, s.user_id AS seller_user_id, s.business_name, s.phone_contact
         FROM wallet.ecomerse_orders o JOIN wallet.ecomerse_sellers s ON s.id = o.seller_id
         WHERE o.idempotency_key=$1 LIMIT 1`, d.idempotencyKey);
            if (existing[0]) {
                return { message: 'Pedido ya registrado (idempotente)', order: this.mapOrder(existing[0]), orders: [this.mapOrder(existing[0])], idempotent: true, orderCount: 1 };
            }
        }
        const paymentMethod = d.paymentMethod;
        if (paymentMethod === 'billing' && !FLAG.billing) {
            throw new common_1.BadRequestException('El pago Billing no está habilitado para Ecomerse todavía (ECOMMERSE_BILLING_ENABLED=false)');
        }
        if (paymentMethod === 'cash' && !FLAG.cash) {
            throw new common_1.BadRequestException('El pago en efectivo no está habilitado (ECOMMERSE_CASH_ENABLED=false)');
        }
        if (paymentMethod === 'likebook_wallet' && !FLAG.wallet) {
            throw new common_1.BadRequestException('El pago con el monedero no está habilitado todavía');
        }
        // ---- Transacción: lock de TODOS los productos, validar, reservar, crear
        const created = [];
        /**
         * PAGO CON EL MONEDERO (parche 101): el importe se RETIENE dentro del mismo flujo, porque el
         * total (productos + reparto) solo lo conoce el servidor al agrupar la compra. Si algo falla
         * después, el cerrojo se DEVUELVE fuera de la transacción.
         *
         * LIMITACIÓN EXPLÍCITA: una compra de VARIOS vendedores crea un pedido por vendedor y el token
         * de pago va ligado a UN importe, así que con monedero solo se admiten compras de UNA tienda
         * (el caso normal). Con varias, se dice claro en vez de cobrar a medias.
         */
        let lockTxId = null;
        try {
            await this.prisma.$transaction(async (tx) => {
                const prodRows = await tx.$queryRawUnsafe(`SELECT p.*, s.id AS seller_id, s.user_id AS seller_user_id, s.business_name, s.phone_contact, s.city AS seller_city
         FROM wallet.ecomerse_products p JOIN wallet.ecomerse_sellers s ON s.id = p.seller_id
         WHERE p.id IN (${allIds.map((_, j) => `$${j + 1}::uuid`).join(',')})
           AND p.status='active' AND s.status='active'
         FOR UPDATE`, ...allIds);
                const byId = new Map(prodRows.map((r) => [String(r.id), r]));
                /* ── FASE 4 · SKU: las COMBINACIONES de los anuncios que se están comprando ───────────────
                   Se leen TODAS de una vez (una consulta, no una por línea) y se indexan por id y por anuncio.
                   Aquí NO se bloquea nada: el bloqueo de verdad lo hace el `UPDATE` del descuento, que lleva
                   `AND stock_quantity >= $2` — la condición que cierra la doble venta. Bloquear ya en el SELECT
                   daría el mismo resultado con dos viajes más. */
                const filasVar = await tx.$queryRawUnsafe(`SELECT id, product_id, name, price_xaf, stock_quantity, image_url, attributes
           FROM wallet.ecomerse_product_variants
          WHERE product_id IN (${allIds.map((_, j) => `$${j + 1}::uuid`).join(',')})`, ...allIds);
                const varPorId = new Map(filasVar.map((v) => [String(v.id), v]));
                const varPorAnuncio = new Map();
                for (const v of filasVar) {
                    const pid = String(v.product_id);
                    varPorAnuncio.set(pid, (varPorAnuncio.get(pid) ?? 0) + 1);
                }
                // Agrupar por vendedor (una orden por vendedor)
                const groups = new Map();
                for (const it of items) {
                    const p = byId.get(it.productId);
                    if (!p)
                        throw new common_1.BadRequestException('Uno de los productos no está disponible');
                    if (String(p.seller_user_id) === userId)
                        throw new common_1.BadRequestException('No puedes comprar tu propio producto');
                    /* ── La combinación elegida, en tres casos que NO se pueden confundir ──────────────────
                       · el anuncio TIENE combinaciones y no se elige ninguna → no se sabe qué descontar: error;
                       · el anuncio TIENE combinaciones y la elegida no es suya → se podría descontar el stock de
                         OTRO anuncio con el mismo `variantId` (el `WHERE` del descuento lo impide, pero mejor
                         decirlo claro y no llegar al UPDATE);
                       · el anuncio NO tiene combinaciones y llega una → error del cliente, no se ignora. */
                    const tieneCombinaciones = (varPorAnuncio.get(String(p.id)) ?? 0) > 0;
                    let variante = null;
                    if (tieneCombinaciones) {
                        if (!it.variantId) {
                            throw new common_1.BadRequestException(`«${p.title}» se vende por tallas o colores: elige la combinación antes de comprar`);
                        }
                        variante = varPorId.get(it.variantId) ?? null;
                        if (!variante || String(variante.product_id) !== String(p.id)) {
                            throw new common_1.BadRequestException(`Esa combinación no es de «${p.title}»`);
                        }
                    }
                    else if (it.variantId) {
                        throw new common_1.BadRequestException(`«${p.title}» no se vende por combinaciones`);
                    }
                    /* El precio de la combinación manda si lo tiene; `NULL` significa «hereda el del anuncio»
                       (es la regla del editor: precio vacío = el del producto). Se congela en la línea, como el
                       título y las fotos: lo pactado no se reescribe cuando el comerciante cambie el precio. */
                    const precio = variante && variante.price_xaf !== null ? Number(variante.price_xaf) : Number(p.price_xaf);
                    /* Las existencias: con combinación manda LA COMBINACIÓN, no el anuncio. El `stock` del
                       anuncio es la suma espejo (`espejarStock`) y por eso no sirve de puerta — la suma puede
                       dar 5 con la combinación elegida a 0. */
                    if (variante) {
                        if (it.qty > Number(variante.stock_quantity)) {
                            throw new common_1.BadRequestException(`Stock insuficiente de «${p.title}» — ${variante.name}: quedan ${variante.stock_quantity}`);
                        }
                    }
                    else if (it.qty > Number(p.stock)) {
                        throw new common_1.BadRequestException(`Stock insuficiente de "${p.title}" (disponible: ${p.stock})`);
                    }
                    /* `handlingHours` viaja DENTRO de la línea del pedido (el `items` es jsonb y ya congela
                       título, precio y fotos). Así el comprador ve, en su pedido, el plazo que el vendedor
                       prometía EL DÍA QUE COMPRÓ, aunque después lo cambie en el anuncio. Es la misma lógica
                       que la comisión congelada del monedero: lo pactado no se reescribe. */
                    const line = {
                        productId: String(p.id), title: p.title, price: precio, qty: it.qty,
                        photos: p.photos ?? [], handlingHours: Number(p.handling_hours ?? 24),
                        returnsAccepted: p.returns_accepted === true || p.returns_accepted === 't',
                        /* La combinación, CONGELADA (id + nombre) y con su foto real: el pedido, el chat y el
                           aviso al vendedor tienen que decir «Rojo · M», no un id que nadie entiende. La foto es
                           la del color comprado, que es la promesa de la ficha. */
                        variantId: variante ? String(variante.id) : null,
                        variantName: variante ? String(variante.name) : null,
                        variantAttributes: variante ? (variante.attributes ?? null) : null,
                        /* La FOTO del color comprado, congelada. Se guarda aunque la app de hoy aún no la pinte
                           (sus pedidos enseñan `photos[0]`): esto se congela en el momento de la compra o no se
                           congela nunca — si el comerciante cambia después la foto del color, el pedido de ayer
                           se quedaría enseñando otra prenda. Es la misma razón por la que se congelan el título y
                           el precio, no una suposición sobre cuándo se pintará. */
                        variantImageUrl: variante ? (variante.image_url ?? null) : null,
                    };
                    const sid = String(p.seller_id);
                    if (!groups.has(sid))
                        groups.set(sid, []);
                    groups.get(sid).push({ p, line, variante });
                }
                // Tarifa logística ÚNICA (se aplica al primer pedido si fulfillment agente)
                let feeApplied = false;
                let orderIdx = 0;
                for (const [sellerId, entries] of groups) {
                    let logisticsFee = 0;
                    let deliveryZoneId = null;
                    let deliveryKm = null;
                    if (d.fulfillmentType === 'agent' && !feeApplied) {
                        feeApplied = true;
                        if (d.deliveryZoneId) {
                            const q = await this.quoteLogistics(d.deliveryZoneId, d.deliveryKm);
                            logisticsFee = q.feeXaf;
                            deliveryZoneId = d.deliveryZoneId;
                            deliveryKm = q.breakdown?.km ?? null;
                        }
                        else {
                            logisticsFee = LOGISTICS_DEFAULT_FEE; // fallback configurable (sin zona)
                        }
                    }
                    const groupTotal = entries.reduce((a, e) => a + e.line.price * e.line.qty, 0);
                    const totalFinal = groupTotal + logisticsFee;
                    /**
                     * El cerrojo del monedero, con el importe EXACTO del pedido (productos + reparto). La
                     * clave sale de la Idempotency-Key de la compra: un reintento del comprador no bloquea
                     * dos veces.
                     */
                    if (paymentMethod === 'likebook_wallet') {
                        if (groups.size > 1) {
                            throw new common_1.BadRequestException('Con el monedero se compra a UNA tienda por pedido: quita los artículos de las otras tiendas o paga en efectivo');
                        }
                        if (!paymentToken) {
                            throw new common_1.BadRequestException('Falta el token de pago del monedero: confirma con tu PIN');
                        }
                        const lock = await this.wallets.lockForCommerceOrder({
                            userId, amount: totalFinal, paymentToken,
                            idempotencyKey: `ec-order:${d.idempotencyKey || crypto.randomUUID()}`,
                        });
                        lockTxId = lock.transactionId;
                    }
                    /* Decremento atómico del stock: el de la COMBINACIÓN si se compró una, el del anuncio si no.
                       Son dos caminos excluyentes porque son dos hechos distintos — «quedan 3 Rojo · M» y «quedan
                       12 unidades de esta cosa»—, y sumar los dos sería contar doble. */
                    for (const e of entries) {
                        if (e.variante) {
                            /* La condición `AND stock_quantity >= $3` es LA MISMA que cerró la doble venta en el
                               anuncio: dos compradores de la última «Rojo · M» a la vez, y la segunda sentencia da 0
                               filas y revierte TODO el pedido (incluidas las otras líneas y el cobro). El `WHERE` va
                               acotado por `product_id` para que un id de otro anuncio no descuente aquí. */
                            const reservado = await tx.$queryRawUnsafe(`UPDATE wallet.ecomerse_product_variants SET stock_quantity = stock_quantity - $2
                WHERE id=$1::uuid AND stock_quantity >= $2 AND product_id=$3::uuid
                RETURNING id`, e.variante.id, e.line.qty, e.line.productId);
                            if (reservado.length === 0) {
                                throw new common_1.BadRequestException(`Stock insuficiente de «${e.line.title}» — ${e.line.variantName} (alguien lo compró antes)`);
                            }
                            /* Y el anuncio se recalcula del ORIGEN, no restando: `stock` = suma de las combinaciones,
                               y `sold_out` si no queda ninguna. Es lo que hace que la tarjeta del Mercado diga la
                               verdad en cuanto el pedido termina. */
                            await this.espejarStock(tx, e.line.productId);
                        }
                        else {
                            const reservado = await tx.$queryRawUnsafe(`UPDATE wallet.ecomerse_products SET stock=stock-$2,
                 status=CASE WHEN stock-$2<=0 THEN 'sold_out' ELSE status END, updated_at=now()
               WHERE id=$1::uuid AND stock >= $2
               RETURNING id`, e.line.productId, e.line.qty);
                            // ── LA CONDICIÓN DECIDE (cierre de la doble venta) ──────────────────
                            // Sin `AND stock >= $2` la base restaba igual y quedaba en NEGATIVO (medido: −1 con dos
                            // compras simultáneas de la última unidad). Con la condición y la transacción real, la
                            // segunda bloquea en la fila, re-evalúa el WHERE con el valor nuevo (0 < 1), da 0 filas y
                            // revierte TODO el pedido — incluidas las otras líneas y el cobro Billing.
                            if (reservado.length === 0) {
                                throw new common_1.BadRequestException(`Stock insuficiente de "${e.line.title}" (alguien lo compró antes)`);
                            }
                        }
                    }
                    let billingOrderId = null;
                    if (paymentMethod === 'billing') {
                        const bo = await this.billing.createCustomAmountOrder(userId, 'ecomerse_purchase', totalFinal, 'ecomerse');
                        billingOrderId = bo.orderId ?? null;
                    }
                    const o = await tx.$queryRawUnsafe(`INSERT INTO wallet.ecomerse_orders (buyer_id, seller_id, items, total_xaf, logistics_fee_xaf, payment_method, billing_order_id, status, delivery_address, note, idempotency_key, fulfillment_type, delivery_zone_id, delivery_km)
           VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, $5, $6, $7::uuid, 'pending', $8, $9, $10, $11, $12::uuid, $13)
           RETURNING id, status`, userId, sellerId, JSON.stringify(entries.map((e) => e.line)), totalFinal, logisticsFee, paymentMethod, billingOrderId, d.deliveryAddress ?? null, d.note ?? null, d.idempotencyKey ?? null, d.fulfillmentType, deliveryZoneId, deliveryKm);
                    const oid = String(o[0].id);
                    created.push({ id: oid, billingOrderId });
                    // Auditoría
                    await tx.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
           VALUES ($1::uuid, NULL, 'pending', 'buyer', $2::uuid, 'Pedido creado')`, oid, userId);
                    // Shipment (agente): solo en el primer pedido
                    if (d.fulfillmentType === 'agent' && orderIdx === 0) {
                        await tx.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_shipments (order_id, fulfillment_type, agent_id, tracking_code, status)
             VALUES ($1::uuid, 'agent', $2::uuid, $3, 'assigned')`, oid, d.agentId ?? null, `TRK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`);
                    }
                    orderIdx++;
                }
            });
        }
        catch (e) {
            // La compra no llegó a existir: el importe retenido vuelve al comprador.
            if (lockTxId) {
                await this.wallets.refundCommerceOrder({ lockTransactionId: lockTxId }).catch(() => undefined);
            }
            throw e;
        }
        if (lockTxId && created[0]?.id) {
            // Parche 105: si el enlace falla, el importe vuelve y el pedido queda para pagar en efectivo.
            const enlace = await this.wallets.linkCommerceLockOrUndo({ transactionId: lockTxId, orderId: String(created[0].id) });
            if (!enlace.linked) {
                await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_orders SET payment_method='cash', updated_at=now() WHERE id=$1::uuid`, String(created[0].id));
                console.error(`[ecomerse] pedido ${created[0].id}: cerrojo no enlazado (${enlace.refunded ? 'importe devuelto' : 'sin devolver, revisar'})`);
            }
        }
        // ---- Fuera de la transacción: notificaciones + respuesta
        const finalOrders = [];
        for (const c of created) {
            const rows = await this.prisma.$queryRawUnsafe(`SELECT o.*, s.business_name, s.phone_contact, s.user_id AS seller_user_id,
                dz.label AS delivery_zone_label
         FROM wallet.ecomerse_orders o JOIN wallet.ecomerse_sellers s ON s.id = o.seller_id
         LEFT JOIN wallet.ecomerse_delivery_zones dz ON dz.id = o.delivery_zone_id
         WHERE o.id=$1::uuid LIMIT 1`, c.id);
            const of = rows[0];
            finalOrders.push(this.mapOrder(of));
            const buyerPhone = await this.userPhone(userId);
            const sellerPhone = await this.sellerPhone(of.seller_user_id);
            if (sellerPhone) {
                void this.sms.send(sellerPhone, 'ecomerse_new_order', {
                    product: of.items?.[0]?.title ?? 'Producto', total: String(Number(of.total_xaf)),
                }, c.id);
            }
            if (buyerPhone) {
                void this.sms.send(buyerPhone, 'ecomerse_order_created', {
                    order: of.id.slice(0, 8), total: String(Number(of.total_xaf)),
                }, c.id);
            }
        }
        const multi = finalOrders.length > 1;
        return {
            message: paymentMethod === 'likebook_wallet'
                ? `Pedido pagado con tu monedero (${Number(finalOrders[0]?.totalXaf ?? 0)} XAF). El importe está en garantía hasta que lo recibas.`
                : paymentMethod === 'cash'
                    ? multi
                        ? `Se crearon ${finalOrders.length} pedidos (uno por vendedor). Paga en efectivo al recibir cada uno.`
                        : 'Pedido creado: paga en efectivo al recibir. El vendedor debe confirmarlo.'
                    : multi
                        ? `Se crearon ${finalOrders.length} pedidos (uno por vendedor). Completa cada pago en Mis pedidos.`
                        : `Pedido creado con pago Billing (${finalOrders[0].totalXaf} XAF). Sigue el comprobante en Checkout.`,
            order: finalOrders[0],
            orders: finalOrders,
            billingOrderId: created[0]?.billingOrderId ?? null,
            orderCount: finalOrders.length,
        };
    }
    async myOrders(userId, as = 'buyer', status, limit, offset) {
        const cond = as === 'buyer' ? 'o.buyer_id=$1::uuid' : 'o.seller_id IN (SELECT id FROM wallet.ecomerse_sellers WHERE user_id=$1::uuid)';
        /* FILTRO POR ESTADO Y PAGINACIÓN (tanda B, patrón de `OmsPortalOrderController.list` de
           macrozheng/mall: `?status=` + pageNum/pageSize). Antes esto devolvía TODOS los pedidos sin
           filtrar ni paginar: con veinte pedidos había que recorrerlos a mano y la pantalla crecía sin
           fin. El estado se valida contra la lista cerrada de la máquina de estados del pedido; un
           valor raro NO se ignora en silencio (eso escondería un fallo de la app), se devuelve lista
           vacía porque el filtro no casa con nada. */
        const ESTADOS_PEDIDO = ['pending', 'confirmed', 'in_transit', 'delivered', 'cancelled'];
        const extra = [];
        const params = [userId];
        if (status && ESTADOS_PEDIDO.includes(status)) {
            params.push(status);
            extra.push(`o.status=$${params.length}`);
        }
        // `limit`/`offset` acotados: nunca más de 100 de golpe, y siempre un mínimo razonable.
        const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
        const off = Math.max(Number(offset) || 0, 0);
        const where = [cond, ...extra].join(' AND ');
        // El total se cuenta aparte para que la app pueda decir «N pedidos» sin traérselos todos.
        const conteo = await this.prisma.$queryRawUnsafe(`SELECT count(*)::int AS total FROM wallet.ecomerse_orders o WHERE ${where}`, ...params);
        const rows = await this.prisma.$queryRawUnsafe(`SELECT o.*, s.business_name, s.phone_contact,
              (SELECT count(*) FROM wallet.ecomerse_disputes d WHERE d.order_id=o.id AND d.status='open') AS open_disputes,
              (SELECT count(*) FROM wallet.ecomerse_reviews r WHERE r.order_id=o.id AND r.buyer_id=o.buyer_id) AS reviewed,
              dz.label AS delivery_zone_label,
              COALESCE((SELECT json_agg(json_build_object('id', e.id, 'fromStatus', e.from_status, 'toStatus', e.to_status, 'actorType', e.actor_type, 'note', e.note, 'createdAt', e.created_at) ORDER BY e.created_at DESC)
                        FROM wallet.ecomerse_order_events e WHERE e.order_id = o.id), '[]'::json) AS events,
              (SELECT json_build_object('id', sh.id, 'fulfillmentType', sh.fulfillment_type, 'agentName', ag.code, 'trackingCode', sh.tracking_code, 'status', sh.status)
               FROM wallet.ecomerse_shipments sh LEFT JOIN wallet.agents ag ON ag.id = sh.agent_id WHERE sh.order_id = o.id LIMIT 1) AS shipment
       FROM wallet.ecomerse_orders o JOIN wallet.ecomerse_sellers s ON s.id = o.seller_id
       LEFT JOIN wallet.ecomerse_delivery_zones dz ON dz.id = o.delivery_zone_id
       WHERE ${where} ORDER BY o.created_at DESC LIMIT ${lim} OFFSET ${off}`, ...params);
        /* Se devuelve un OBJETO con los pedidos y el total, no un array pelado. Es un cambio de forma
           en la respuesta, pero necesario para paginar: sin el total, la app no puede saber si quedan
           más. La app se actualiza en el mismo despliegue. */
        return {
            orders: rows.map((r) => ({ ...this.mapOrder(r), events: r.events ?? [], shipment: r.shipment ?? null })),
            total: Number(conteo[0]?.total ?? 0),
            limit: lim,
            offset: off,
        };
    }
    /**
     * Cuántos pedidos hay en cada estado (tanda B). Sirve para poner el número en las pestañas del
     * filtro, igual que hace el panel de `mall`: sin contadores, el usuario no sabe dónde está lo que
     * busca y tiene que ir abriendo pestañas a ciegas. Una sola consulta agrupada, no cinco.
     */
    async orderCounts(userId, as = 'buyer') {
        const cond = as === 'buyer' ? 'o.buyer_id=$1::uuid' : 'o.seller_id IN (SELECT id FROM wallet.ecomerse_sellers WHERE user_id=$1::uuid)';
        const rows = await this.prisma.$queryRawUnsafe(`SELECT o.status, count(*)::int AS n FROM wallet.ecomerse_orders o WHERE ${cond} GROUP BY o.status`, userId);
        const porEstado = {};
        let total = 0;
        for (const r of rows) {
            porEstado[String(r.status)] = Number(r.n);
            total += Number(r.n);
        }
        return { total, porEstado };
    }
    async getOrder(userId, orderId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT o.*, s.business_name, s.phone_contact, s.user_id AS seller_user_id,
              (SELECT count(*) FROM wallet.ecomerse_disputes d WHERE d.order_id=o.id AND d.status='open') AS open_disputes,
              dz.label AS delivery_zone_label
       FROM wallet.ecomerse_orders o JOIN wallet.ecomerse_sellers s ON s.id = o.seller_id
       LEFT JOIN wallet.ecomerse_delivery_zones dz ON dz.id = o.delivery_zone_id
       WHERE o.id=$1::uuid LIMIT 1`, orderId);
        if (!rows[0])
            throw new common_1.NotFoundException('Pedido no encontrado');
        if (String(rows[0].buyer_id) !== userId && String(rows[0].seller_user_id) !== userId) {
            throw new common_1.ForbiddenException('No es tu pedido');
        }
        return this.mapOrder(rows[0]);
    }
    /** Transiciones de estado (máquina estricta + auditoría + SMS). El stock ya
     *  se reservó al crear el pedido; aquí solo se avanza el ciclo. */
    async updateOrderStatus(userId, orderId, status, as) {
        const d = this.parse(ecomerse_dto_1.OrderStatusSchema, { status, as: as ?? 'buyer' });
        status = d.status;
        const rows = await this.prisma.$queryRawUnsafe(`SELECT o.*, s.user_id AS seller_user_id, s.phone_contact FROM wallet.ecomerse_orders o
       JOIN wallet.ecomerse_sellers s ON s.id = o.seller_id WHERE o.id=$1::uuid LIMIT 1`, orderId);
        if (!rows[0])
            throw new common_1.NotFoundException('Pedido no encontrado');
        const o = rows[0];
        const isBuyer = String(o.buyer_id) === userId;
        const isSeller = String(o.seller_user_id) === userId;
        if (!isBuyer && !isSeller)
            throw new common_1.ForbiddenException('No es tu pedido');
        if (o.status === 'cancelled' || o.status === 'disputed')
            throw new common_1.BadRequestException('Pedido cerrado');
        // El rol se infiere del TOKEN (nunca del body/query): el comprador no puede
        // confirmar ni marcar tránsito como vendedor, y viceversa.
        const role = isSeller ? 'seller' : 'buyer';
        const next = {
            seller: { pending: 'confirmed', confirmed: 'in_transit', in_transit: 'delivered' },
            buyer: { in_transit: 'delivered' },
        };
        if (next[role][o.status] !== status) {
            throw new common_1.BadRequestException(`Transición inválida: ${o.status} → ${status}`);
        }
        // El vendedor no confirma hasta que el pago Billing esté aprobado (no enviar sin cobro)
        if (role === 'seller' && status === 'confirmed' && o.payment_method === 'billing' && o.billing_order_id) {
            const bo = await this.prisma.$queryRawUnsafe(`SELECT status FROM wallet.billing_orders WHERE id=$1::uuid`, o.billing_order_id);
            if (!bo[0] || bo[0].status !== 'approved') {
                throw new common_1.BadRequestException('Espera a que el administrador apruebe el comprobante de pago antes de confirmar.');
            }
        }
        const from = o.status;
        const isDelivery = status === 'delivered';
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_orders SET status=$2, delivered_at=CASE WHEN $2='delivered' THEN now() ELSE delivered_at END,
         warranty_expires_at=CASE WHEN $2='delivered' THEN now() + ($3::int || ' days')::interval ELSE warranty_expires_at END,
         updated_at=now() WHERE id=$1::uuid`, orderId, status, WARRANTY_DAYS);
        await this.prisma.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6)`, orderId, from, status, role, userId, status === 'delivered' ? 'Entrega confirmada · garantía 7 días' : `Transición a ${status}`);
        // Parche 101: al ENTREGAR, el vendedor cobra en su monedero (neto = importe − reparto).
        if (isDelivery)
            await this.liberarSiMonederoEc(orderId, String(o.seller_user_id));
        // SMS al comprador en cada avance
        const buyerPhone = await this.userPhone(String(o.buyer_id));
        if (buyerPhone) {
            void this.sms.send(buyerPhone, 'ecomerse_order_status', {
                order: orderId.slice(0, 8), status,
            }, orderId);
        }
        return { message: isDelivery ? 'Entrega confirmada · garantía de 7 días activa' : `Pedido → ${status}` };
    }
    /** Cancelar pedido (comprador o vendedor): restaura stock reservado + auditoría. */
    async cancelOrder(userId, orderId, reason) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT o.*, s.user_id AS seller_user_id FROM wallet.ecomerse_orders o
       JOIN wallet.ecomerse_sellers s ON s.id = o.seller_id WHERE o.id=$1::uuid LIMIT 1`, orderId);
        if (!rows[0])
            throw new common_1.NotFoundException('Pedido no encontrado');
        const o = rows[0];
        const isBuyer = String(o.buyer_id) === userId;
        const isSeller = String(o.seller_user_id) === userId;
        if (!isBuyer && !isSeller)
            throw new common_1.ForbiddenException('No es tu pedido');
        if (!['pending', 'confirmed'].includes(o.status)) {
            throw new common_1.BadRequestException('Solo se cancelan pedidos pendientes o confirmados (antes del envío)');
        }
        const from = o.status;
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`UPDATE wallet.ecomerse_orders SET status='cancelled', cancelled_at=now(), cancellation_reason=$2, updated_at=now()
         WHERE id=$1::uuid`, orderId, reason ?? null);
            // Restaurar stock reservado (items snapshot). Con combinación, la unidad vuelve a LA
            // COMBINACIÓN y el anuncio se recalcula; sin ella, al anuncio. Ver `reponerLinea`.
            for (const it of o.items ?? []) {
                await this.reponerLinea(tx, it);
            }
            await tx.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
         VALUES ($1::uuid, $2, 'cancelled', $3, $4::uuid, $5)`, orderId, from, isBuyer ? 'buyer' : 'seller', userId, `Cancelado: ${reason ?? 'sin motivo'}`);
        });
        // Parche 101: si se pagó con el monedero, el importe retenido VUELVE al comprador.
        await this.devolverSiMonederoEc(orderId);
        return { message: 'Pedido cancelado · stock restaurado' };
    }
    /** Seguimiento del envío (fulfillment por agente). */
    async shipment(orderId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT s.*, a.code AS agent_code FROM wallet.ecomerse_shipments s
       LEFT JOIN wallet.agents a ON a.id = s.agent_id
       WHERE s.order_id=$1::uuid LIMIT 1`, orderId);
        if (!rows[0])
            throw new common_1.NotFoundException('Este pedido no tiene envío asignado');
        const r = rows[0];
        return {
            id: String(r.id), orderId: String(r.order_id), fulfillmentType: r.fulfillment_type,
            agentId: r.agent_id ? String(r.agent_id) : null, agentCode: r.agent_code ?? null,
            trackingCode: r.tracking_code, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
        };
    }
    /** Avanza el estado del envío (agente o admin). */
    async updateShipmentStatus(userId, orderId, body) {
        const d = this.parse(ecomerse_dto_1.ShipmentStatusSchema, body ?? {});
        const sh = await this.prisma.$queryRawUnsafe(`SELECT s.*, o.buyer_id, o.seller_id, seller.user_id AS seller_user_id
       FROM wallet.ecomerse_shipments s
       JOIN wallet.ecomerse_orders o ON o.id = s.order_id
       JOIN wallet.ecomerse_sellers seller ON seller.id = o.seller_id
       WHERE s.order_id=$1::uuid LIMIT 1`, orderId);
        if (!sh[0])
            throw new common_1.NotFoundException('Sin envío asignado');
        if (String(sh[0].seller_user_id) !== userId)
            throw new common_1.ForbiddenException('Solo el vendedor gestiona el envío');
        const flow = ['assigned', 'picked_up', 'in_transit', 'delivered'];
        const idx = flow.indexOf(sh[0].status);
        if (idx < 0 || flow[idx + 1] !== d.status) {
            throw new common_1.BadRequestException(`Transición de envío inválida: ${sh[0].status} → ${d.status}`);
        }
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_shipments SET status=$2, updated_at=now() WHERE id=$1::uuid`, sh[0].id, d.status);
        // Sincronizar PEDIDO con el ENVÍO (una sola verdad):
        //   picked_up / in_transit → pedido in_transit · delivered → pedido delivered
        if (d.status === 'picked_up' || d.status === 'in_transit') {
            await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_orders SET status='in_transit', updated_at=now()
         WHERE id=$1::uuid AND status IN ('pending','confirmed')`, orderId);
        }
        if (d.status === 'delivered') {
            await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_orders SET status='delivered', delivered_at=now(),
           warranty_expires_at=now() + ($2::int || ' days')::interval, updated_at=now()
         WHERE id=$1::uuid`, orderId, WARRANTY_DAYS);
            await this.prisma.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
         VALUES ($1::uuid, 'in_transit', 'delivered', 'system', $2::uuid, 'Entregado por agente')`, orderId, userId);
            const buyerPhone = await this.userPhone(String(sh[0].buyer_id));
            if (buyerPhone)
                void this.sms.send(buyerPhone, 'ecomerse_order_status', { order: orderId.slice(0, 8), status: 'delivered' }, orderId);
        }
        return { message: `Envío → ${d.status}` };
    }
    /** Eventos de auditoría de un pedido (timeline). */
    async orderEvents(orderId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT * FROM wallet.ecomerse_order_events WHERE order_id=$1::uuid ORDER BY created_at`, orderId);
        return rows.map((r) => ({
            id: String(r.id), fromStatus: r.from_status ?? null, toStatus: r.to_status,
            actorType: r.actor_type, actorId: r.actor_id ? String(r.actor_id) : null,
            note: r.note ?? null, createdAt: r.created_at,
        }));
    }
    // ------------------------------------------------------------------ DISPUTAS
    /** Comprador abre disputa dentro de la garantía (7 días). */
    async openDispute(userId, orderId, body) {
        const d = this.parse(ecomerse_dto_1.DisputeCreateSchema, body ?? {});
        const rows = await this.prisma.$queryRawUnsafe(`SELECT * FROM wallet.ecomerse_orders WHERE id=$1::uuid AND buyer_id=$2::uuid LIMIT 1`, orderId, userId);
        if (!rows[0])
            throw new common_1.ForbiddenException('No eres el comprador de este pedido');
        const o = rows[0];
        if (o.status !== 'delivered')
            throw new common_1.BadRequestException('La disputa solo se abre tras la entrega');
        if (o.warranty_expires_at && new Date(o.warranty_expires_at) < new Date()) {
            throw new common_1.BadRequestException('La garantía de 7 días ha expirado');
        }
        const dup = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_disputes WHERE order_id=$1::uuid AND status='open' LIMIT 1`, orderId);
        if (dup[0])
            throw new common_1.BadRequestException('Ya existe una disputa abierta para este pedido');
        const dd = await this.prisma.$queryRawUnsafe(`INSERT INTO wallet.ecomerse_disputes (order_id, opened_by, reason, evidence, status)
       VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, 'open') RETURNING id, status`, orderId, userId, d.reason, JSON.stringify(d.evidence));
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_orders SET status='disputed', updated_at=now() WHERE id=$1::uuid`, orderId);
        await this.prisma.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
       VALUES ($1::uuid, 'delivered', 'disputed', 'buyer', $2::uuid, $3)`, orderId, userId, d.reason);
        // Notificar al vendedor
        const sellerInfo = await this.prisma.$queryRawUnsafe(`SELECT s.user_id AS seller_user_id, o.buyer_id FROM wallet.ecomerse_orders o
       JOIN wallet.ecomerse_sellers s ON s.id = o.seller_id WHERE o.id=$1::uuid LIMIT 1`, orderId);
        if (sellerInfo[0]?.seller_user_id) {
            const sp = await this.sellerPhone(String(sellerInfo[0].seller_user_id));
            if (sp)
                void this.sms.send(sp, 'ecomerse_dispute_open', { order: orderId.slice(0, 8), reason: d.reason }, orderId);
        }
        return { message: 'Disputa abierta · el administrador la revisará', disputeId: String(dd[0].id) };
    }
    // ------------------------------------------------------------------ REVIEWS
    async review(userId, orderId, body) {
        const d = this.parse(ecomerse_dto_1.ReviewCreateSchema, body ?? {});
        const rating = d.rating;
        const rows = await this.prisma.$queryRawUnsafe(`SELECT * FROM wallet.ecomerse_orders WHERE id=$1::uuid AND buyer_id=$2::uuid AND status='delivered' LIMIT 1`, orderId, userId);
        if (!rows[0])
            throw new common_1.BadRequestException('Solo se valora un pedido entregado');
        await this.prisma.$queryRawUnsafe(`INSERT INTO wallet.ecomerse_reviews (order_id, seller_id, buyer_id, rating, comment)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
       ON CONFLICT (order_id) DO NOTHING`, orderId, rows[0].seller_id, userId, rating, d.comment ?? null);
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_sellers SET
         rating_avg = ((rating_avg * rating_count) + $2) / (rating_count + 1),
         rating_count = rating_count + 1
       WHERE id=$1::uuid`, rows[0].seller_id, rating);
        return { message: 'Valoración publicada' };
    }
    // ------------------------------------------------------------------ REPORTES
    /** Cualquier usuario reporta un listing (moderación). */
    async reportProduct(userId, productId, body) {
        if (!FLAG.f1)
            throw new common_1.BadRequestException('Ecomerse no está habilitado');
        const d = this.parse(ecomerse_dto_1.ReportCreateSchema, body ?? {});
        const rows = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_products WHERE id=$1::uuid LIMIT 1`, productId);
        if (!rows[0])
            throw new common_1.NotFoundException('Producto no encontrado');
        await this.prisma.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_reports (product_id, user_id, reason, note)
       VALUES ($1::uuid, $2::uuid, $3, $4)`, productId, userId, d.reason, d.note ?? null);
        return { message: 'Reporte enviado, gracias por tu ayuda' };
    }
    async adminReports() {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT r.*, p.title AS product_title, p.seller_id,
              (SELECT s.business_name FROM wallet.ecomerse_sellers s WHERE s.id = p.seller_id) AS business_name
       FROM wallet.ecomerse_reports r
       JOIN wallet.ecomerse_products p ON p.id = r.product_id
       WHERE r.status='open' ORDER BY r.created_at DESC LIMIT 200`);
        const phones = await this.resolvePhones(rows.map((r) => String(r.user_id)));
        return rows.map((r) => ({
            id: String(r.id), productId: String(r.product_id), productTitle: r.product_title,
            sellerId: r.seller_id ? String(r.seller_id) : null, businessName: r.business_name ?? null,
            reportedBy: String(r.user_id), reportedPhone: phones.get(String(r.user_id)) ?? null,
            reason: r.reason, note: r.note ?? null, status: r.status, createdAt: r.created_at,
        }));
    }
    async adminResolveReport(adminId, reportId, body) {
        const d = this.parse(ecomerse_dto_1.ReportResolveSchema, body ?? {});
        const status = d.status;
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_reports SET status=$2, resolved_by=$3::uuid, resolved_at=now()
       WHERE id=$1::uuid AND status='open'`, reportId, status, adminId);
        // Si se toma acción, bajar el listing
        if (status === 'action_taken') {
            await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_products SET status='rejected', rejection_reason='Reportado y retirado por moderación', updated_at=now()
         WHERE id=(SELECT product_id FROM wallet.ecomerse_reports WHERE id=$1::uuid)`, reportId);
        }
        return { message: status === 'dismissed' ? 'Reporte descartado' : 'Reporte resuelto · listing retirado' };
    }
    // ------------------------------------------------------------------ ADMIN
    async adminSellers(status) {
        const cond = status ? `WHERE s.status=$1` : '';
        const rows = await this.prisma.$queryRawUnsafe(`SELECT s.*, ${this.camposDeTienda()} FROM wallet.ecomerse_sellers s
       ${this.joinsDeArbol('s')} ${cond}
       ORDER BY s.created_at DESC LIMIT 300`, ...(status ? [status] : []));
        const phones = await this.resolvePhones(rows.map((r) => String(r.user_id)));
        return rows.map((r) => ({
            id: String(r.id), userId: String(r.user_id), phone: phones.get(String(r.user_id)) ?? null,
            businessName: r.business_name, departmentLabel: r.department_label ?? null, familyLabel: r.family_label ?? null,
            categoryLabel: r.family_label ?? r.department_label ?? null, description: r.description ?? null,
            city: r.city, phoneContact: r.phone_contact ?? null, status: r.status, rejectionReason: r.rejection_reason ?? null,
            ratingAvg: Number(r.rating_avg), ratingCount: Number(r.rating_count), createdAt: r.created_at,
        }));
    }
    async adminDecideSeller(adminId, sellerId, body) {
        const d = this.parse(ecomerse_dto_1.AdminDecisionSchema, body ?? {});
        const approve = d.approve === true;
        const reason = d.reason ?? null;
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_sellers SET status=$2, rejection_reason=$3, approved_at=CASE WHEN $2='active' THEN now() ELSE approved_at END, updated_at=now() WHERE id=$1::uuid`, sellerId, approve ? 'active' : 'rejected', approve ? null : reason);
        return { message: approve ? 'Vendedor aprobado' : 'Vendedor rechazado' };
    }
    async adminProducts(status) {
        const cond = status ? `WHERE p.status=$1` : `WHERE p.status IN ('pending','active','rejected','sold_out')`;
        const rows = await this.prisma.$queryRawUnsafe(`SELECT p.*, s.business_name, ${this.camposDeArbol()}
       FROM wallet.ecomerse_products p
       JOIN wallet.ecomerse_sellers s ON s.id = p.seller_id
       ${this.joinsDeArbol('p')} ${cond}
       ORDER BY p.created_at DESC LIMIT 300`, ...(status ? [status] : []));
        return rows.map((r) => ({ ...this.mapProduct(r), businessName: r.business_name }));
    }
    async adminDecideProduct(adminId, productId, body) {
        const d = this.parse(ecomerse_dto_1.AdminDecisionSchema, body ?? {});
        const approve = d.approve === true;
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_products SET status=$2, rejection_reason=$3, updated_at=now() WHERE id=$1::uuid`, productId, approve ? 'active' : 'rejected', approve ? null : (d.reason ?? null));
        return { message: approve ? 'Producto aprobado' : 'Producto rechazado' };
    }
    async adminDisputes() {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT d.*, o.total_xaf, o.buyer_id, s.business_name, s.user_id AS seller_user_id
       FROM wallet.ecomerse_disputes d
       JOIN wallet.ecomerse_orders o ON o.id = d.order_id
       JOIN wallet.ecomerse_sellers s ON s.id = o.seller_id
       WHERE d.status='open' ORDER BY d.created_at DESC LIMIT 200`);
        return rows.map((r) => ({
            id: String(r.id), orderId: String(r.order_id), openedBy: String(r.opened_by), reason: r.reason,
            evidence: r.evidence ?? [], totalXaf: Number(r.total_xaf), businessName: r.business_name,
            sellerUserId: String(r.seller_user_id), createdAt: r.created_at,
        }));
    }
    async adminResolveDispute(adminId, disputeId, body) {
        const d = this.parse(ecomerse_dto_1.DisputeResolveSchema, body ?? {});
        const rows = await this.prisma.$queryRawUnsafe(`SELECT order_id FROM wallet.ecomerse_disputes WHERE id=$1::uuid AND status='open' LIMIT 1`, disputeId);
        if (!rows[0])
            throw new common_1.NotFoundException('Disputa no encontrada o ya resuelta');
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_disputes SET status='resolved', resolution=$2, resolved_by=$3::uuid, resolved_at=now() WHERE id=$1::uuid`, disputeId, d.resolution ?? null, adminId);
        const finalStatus = d.refund === true ? 'cancelled' : 'delivered';
        const fromStatus = await this.prisma.$queryRawUnsafe(`SELECT status FROM wallet.ecomerse_orders WHERE id=$1::uuid LIMIT 1`, rows[0].order_id);
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_orders SET status=$2, updated_at=now() WHERE id=$1::uuid`, rows[0].order_id, finalStatus);
        await this.prisma.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
       VALUES ($1::uuid, $2, $3, 'admin', $4::uuid, $5)`, rows[0].order_id, fromStatus[0]?.status ?? 'disputed', finalStatus, adminId, d.refund === true ? 'Disputa resuelta: reembolso manual al comprador' : 'Disputa resuelta: a favor del vendedor');
        // Notificar al comprador
        const orderInfo = await this.prisma.$queryRawUnsafe(`SELECT buyer_id FROM wallet.ecomerse_orders WHERE id=$1::uuid LIMIT 1`, rows[0].order_id);
        if (orderInfo[0]?.buyer_id) {
            const bp = await this.userPhone(String(orderInfo[0].buyer_id));
            if (bp)
                void this.sms.send(bp, 'ecomerse_dispute_resolved', {
                    order: String(rows[0].order_id).slice(0, 8),
                    result: d.refund === true ? 'reembolso' : 'confirmado',
                }, String(rows[0].order_id));
        }
        return { message: d.refund === true ? 'Disputa resuelta · pedido cancelado (reembolso manual al comprador)' : 'Disputa resuelta · pedido confirmado' };
    }
    // ------------------------------------------------------------------ ESCROW
    /**
     * BARRIDO DE CADUCIDAD (auditoría 17/09, parche 106 — hallazgo MEDIO 5).
     *
     * Un pedido con monedero atascado en `in_transit` (el vendedor envió y nunca entregó) no tenía
     * salida: el comprador no puede cancelar ahí y el importe se quedaba retenido indefinidamente.
     * Pasado el plazo se cancela, se devuelve el importe y se restaura el stock reservado.
     */
    async expireStale(horas = 24, limit = 200) {
        const h = Math.min(Math.max(Number(horas) || 24, 1), 720);
        const filas = await this.prisma.$queryRawUnsafe(`SELECT id, items FROM wallet.ecomerse_orders
        WHERE payment_method = 'likebook_wallet' AND status IN ('pending','confirmed','in_transit')
          AND updated_at < now() - ($1::int || ' hours')::interval
        ORDER BY updated_at ASC LIMIT $2`, h, Math.min(Math.max(Number(limit) || 200, 1), 500));
        let cancelados = 0;
        for (const f of filas) {
            const upd = await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_orders SET status='cancelled', cancelled_at=now(),
                cancellation_reason=$2, updated_at=now()
          WHERE id=$1::uuid AND status IN ('pending','confirmed','in_transit')`, String(f.id), `Caducado por el barrido: sin movimiento en ${h} h · importe devuelto`);
            if (!upd)
                continue;
            // Mismo criterio que la cancelación, por el MISMO método: si el barrido repusiera al anuncio
            // una línea con combinación, el espejo mentiría (ver `reponerLinea`).
            for (const it of (f.items ?? [])) {
                await this.reponerLinea(this.prisma, it).catch(() => undefined);
            }
            await this.prisma.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
         VALUES ($1::uuid, NULL, 'cancelled', 'system', NULL, $2)`, String(f.id), `Caducado por el barrido (${h} h) · importe devuelto`).catch(() => undefined);
            await this.devolverSiMonederoEc(String(f.id));
            cancelados += 1;
        }
        if (cancelados)
            console.warn(`[ecomerse] barrido: ${cancelados} pedido(s) con monedero caducados y devueltos`);
        return { revisados: filas.length, cancelados };
    }
    /**
     * LIBERAR EL MONEDERO AL ENTREGAR (parche 101). El vendedor cobra el importe MENOS el reparto
     * (el reparto queda retenido como ingreso de plataforma hasta que exista su módulo de pago, igual
     * que en comercio, comida y ciudad-a-ciudad). Ecomerse todavía no tiene comisión de plataforma en
     * el pedido: cuando la tenga, entra aquí como `platformFee`.
     */
    async liberarSiMonederoEc(orderId, sellerUserId) {
        const filas = await this.prisma.$queryRawUnsafe(`SELECT payment_method, status, total_xaf, logistics_fee_xaf FROM wallet.ecomerse_orders WHERE id=$1::uuid LIMIT 1`, orderId);
        const o = filas[0];
        if (!o || String(o.payment_method) !== 'likebook_wallet' || String(o.status) !== 'delivered')
            return;
        const total = Number(o.total_xaf ?? 0);
        const reparto = Math.max(0, Number(o.logistics_fee_xaf ?? 0));
        if (total <= 0)
            return;
        try {
            await this.wallets.releaseCommerceOrder({
                orderId, sellerId: sellerUserId,
                sellerNet: Math.max(0, total - reparto), platformFee: 0, deliveryHeld: reparto,
            });
        }
        catch (e) {
            console.warn(`[ecomerse] pedido ${orderId} entregado pero el monedero no se liberó: ${e.message}`);
        }
    }
    /** DEVOLVER EL MONEDERO AL CANCELAR (parche 101). Idempotente. */
    async devolverSiMonederoEc(orderId) {
        const filas = await this.prisma.$queryRawUnsafe(`SELECT payment_method, status FROM wallet.ecomerse_orders WHERE id=$1::uuid LIMIT 1`, orderId);
        const o = filas[0];
        if (!o || String(o.payment_method) !== 'likebook_wallet' || String(o.status) !== 'cancelled')
            return;
        try {
            await this.wallets.refundCommerceOrder({ orderId });
        }
        catch (e) {
            console.warn(`[ecomerse] pedido ${orderId} cancelado y sin devolver el monedero: ${e.message}`);
        }
    }
    /** Vista admin SOLO LECTURA del escrow preparado (F2, inactivo). */
    async adminEscrowPreview() {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT e.*, o.total_xaf AS order_total, o.status AS order_status,
              (SELECT count(*) FROM wallet.ecomerse_escrow_tokens t WHERE t.escrow_id = e.id) AS token_count
       FROM wallet.ecomerse_escrow e
       LEFT JOIN wallet.ecomerse_orders o ON o.id = e.order_id
       ORDER BY e.created_at DESC LIMIT 100`);
        return rows.map((r) => ({
            id: String(r.id), orderId: r.order_id ? String(r.order_id) : null,
            uuidPublic: r.uuid_public, agentId: r.agent_id ? String(r.agent_id) : null,
            amountXaf: Number(r.amount_xaf), paymentMethod: r.payment_method, status: r.status,
            hasBuyerToken: !!r.buyer_token_hash, hasSellerToken: !!r.seller_token_hash,
            fundedAt: r.funded_at ?? null, releasedAt: r.released_at ?? null,
            warrantyExpiresAt: r.warranty_expires_at ?? null, tokenCount: Number(r.token_count ?? 0),
            orderStatus: r.order_status ?? null, createdAt: r.created_at,
            escrowActive: FLAG.escrow, // siempre false en F1
        }));
    }
    // ------------------------------------------------------------------ INTERNO
    /** Teléfono del usuario (mobility.users, cliente mobility). */
    async userPhone(userId) {
        const rows = await this.mobility.$queryRaw `
      SELECT phone FROM mobility.users WHERE id = ${userId}::uuid LIMIT 1`;
        return rows[0]?.phone ?? null;
    }
    /** Teléfono del vendedor (mobility.users por user_id). */
    async sellerPhone(sellerUserId) {
        return this.userPhone(sellerUserId);
    }
    async requireActiveSeller(userId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT * FROM wallet.ecomerse_sellers WHERE user_id=$1::uuid AND status='active' LIMIT 1`, userId);
        if (!rows[0]) {
            const anyS = await this.prisma.$queryRawUnsafe(`SELECT status, rejection_reason FROM wallet.ecomerse_sellers WHERE user_id=$1::uuid LIMIT 1`, userId);
            if (anyS[0]?.status === 'pending') {
                throw new common_1.BadRequestException('Tu negocio está en revisión del administrador. Publicarás cuando sea aprobado.');
            }
            if (anyS[0]?.status === 'rejected') {
                throw new common_1.BadRequestException(`Tu negocio fue rechazado: ${anyS[0].rejection_reason ?? 'sin motivo'}`);
            }
            throw new common_1.BadRequestException('Para vender debes dar de alta tu negocio (requisitos: KYC + datos + aprobación admin).');
        }
        return rows[0];
    }
    /** KYC aprobado en mobility (APPROVED_L1/APPROVED_L2). */
    async kycOk(userId) {
        const rows = await this.mobility.$queryRaw `
      SELECT status FROM mobility.kyc_submissions
      WHERE user_id = ${userId}::uuid
        AND status IN ('APPROVED_L1','APPROVED_L2')
      ORDER BY decided_at DESC NULLS LAST LIMIT 1`;
        return { ok: rows.length > 0 };
    }
    async resolvePhones(userIds) {
        const map = new Map();
        const uniq = [...new Set(userIds.filter(Boolean))];
        for (let i = 0; i < uniq.length; i += 50) {
            const batch = uniq.slice(i, i + 50);
            const rows = await this.mobility.$queryRawUnsafe(`SELECT id, phone FROM mobility.users WHERE id IN (${batch.map((_, j) => `$${j + 1}::uuid`).join(',')})`, ...batch);
            for (const r of rows)
                map.set(String(r.id), String(r.phone));
        }
        return map;
    }
    /** Vendedores con identidad verificada (KYC aprobado) — el escudo solo si es real. */
    async resolveVerified(userIds) {
        const map = new Map();
        const uniq = [...new Set(userIds.filter(Boolean))];
        for (let i = 0; i < uniq.length; i += 50) {
            const batch = uniq.slice(i, i + 50);
            const rows = await this.mobility.$queryRawUnsafe(`SELECT user_id FROM mobility.kyc_submissions
         WHERE user_id IN (${batch.map((_, j) => `$${j + 1}::uuid`).join(',')})
           AND status IN ('APPROVED_L1','APPROVED_L2')`, ...batch);
            for (const r of rows)
                map.set(String(r.user_id), true);
        }
        return map;
    }
    mapProduct(r) {
        return {
            id: String(r.id), title: r.title, description: r.description ?? null,
            /* EL ÁRBOL, con sus tres niveles dichos por su nombre. Antes había `categoryId` y
               `subcategoryId`, dos campos que en realidad eran «el nivel de arriba» y «el de abajo» y que
               al añadir un tercer nivel se quedaban sin decir cuál era cuál. */
            departmentId: r.department_id ? String(r.department_id) : null,
            departmentLabel: r.department_label ?? null, departmentIcon: r.department_icon ?? null,
            familyId: r.family_id ? String(r.family_id) : null,
            familyLabel: r.family_label ?? null,
            leafId: r.leaf_id ? String(r.leaf_id) : null,
            leafLabel: r.leaf_label ?? null,
            /* COMPATIBILIDAD, y no por pereza: las dos claves viejas que la app ya manda y lee siguen
               aquí con el papel que de verdad hacían. En el árbol viejo había 21 categorías y 134
               subcategorías; esas 21 se han convertido en las FAMILIAS del árbol nuevo y las 134 en las
               HOJAS, así que `categoryId` es la familia y `subcategoryId` la hoja. Se rellenan solas y una
               app sin actualizar sigue filtrando y pintando algo cierto. */
            categoryId: r.family_id ? String(r.family_id) : null,
            subcategoryId: r.leaf_id ? String(r.leaf_id) : null,
            subcategoryLabel: r.leaf_label ?? null,
            /* `categoryLabel` es «la etiqueta más específica que este anuncio tiene»: hoja si la hay, si
               no familia, si no departamento. Es lo que ya pintaban la tarjeta y la ficha. */
            categoryLabel: r.leaf_label ?? r.family_label ?? r.department_label ?? null,
            /* El icono ya no puede salir de la hoja (las hojas no llevan): el que hay es el del
               departamento, y se sigue dando para no dejar la tarjeta sin su emoji. */
            categoryIcon: r.department_icon ?? null,
            priceXaf: Number(r.price_xaf), city: r.city, photos: r.photos ?? [],
            stock: Number(r.stock ?? 0), status: r.status, rejectionReason: r.rejection_reason ?? null,
            isNegotiable: r.is_negotiable === true || r.is_negotiable === 't', views: Number(r.views ?? 0),
            favoriteCount: Number(r.favorite_count ?? 0),
            attributes: r.attributes ?? {},
            /** Tanda 4: plazo de preparación y devoluciones del vendedor (columnas propias, no `attributes`). */
            handlingHours: r.handling_hours === undefined || r.handling_hours === null ? 24 : Number(r.handling_hours),
            returnsAccepted: r.returns_accepted === true || r.returns_accepted === 't',
            isFeatured: r.is_featured === true || r.is_featured === 't',
            featuredUntil: r.featured_until ?? null,
            createdAt: r.created_at, updatedAt: r.updated_at,
            seller: {
                id: r.seller_id ? String(r.seller_id) : null, businessName: r.business_name ?? null,
                ratingAvg: Number(r.rating_avg ?? 5), ratingCount: Number(r.rating_count ?? 0),
                city: r.seller_city ?? r.city ?? null, phoneContact: r.phone_contact ?? null,
                photoKey: r.seller_photo ?? null, userId: r.seller_user_id ? String(r.seller_user_id) : null,
                badge: Number(r.seller_rank ?? 0) >= 2 ? 'Pro' : null,
                verified: r.seller_verified === true || r.seller_verified === 't',
            },
        };
    }
    // ------------------------------------------------------------------ TIENDA (monetización)
    /** Cuota de tienda DERIVADA de billing_entitlements activos (sin tabla extra):
     *  Gratis 8 · Flash 16 · Pro 32 (+badge+1 destacado) · Pro Max 100 (+badge+prioridad+1 destacado). */
    async getShopQuota(userId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT e.code AS plan_code, e.expires_at, p.features FROM wallet.billing_entitlements e
       JOIN wallet.billing_plans p ON p.code = e.code
       WHERE e.user_id=$1::uuid AND e.module='ecomerse'
         AND e.code IN ('ecomerse_shop_flash','ecomerse_shop_pro','ecomerse_shop_pro_max')
         AND e.status IN ('active','expiring_soon','grace')
       ORDER BY CASE e.code WHEN 'ecomerse_shop_pro_max' THEN 3 WHEN 'ecomerse_shop_pro' THEN 2 ELSE 1 END DESC
       LIMIT 1`, userId);
        if (rows[0]) {
            const f = (rows[0].features ?? {});
            const code = rows[0].plan_code;
            const name = code === 'ecomerse_shop_pro_max' ? 'Tienda Pro Max'
                : code === 'ecomerse_shop_pro' ? 'Tienda Pro' : 'Tienda Flash';
            return {
                limit: Number(f.shopQuota ?? 16), badge: f.shopBadge === true, priority: f.priority === true,
                monthlyFeatured: Number(f.monthlyFeatured ?? 0), plan: code, name,
                expiresAt: rows[0].expires_at ?? null,
            };
        }
        return { limit: SHOP_BASIC_QUOTA, badge: false, priority: false, monthlyFeatured: 0, plan: 'ecomerse_shop_basic', name: 'Tienda Gratis', expiresAt: null };
    }
    async countActiveProducts(sellerId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM wallet.ecomerse_products
       WHERE seller_id=$1::uuid AND status='active'`, sellerId);
        return rows[0].n;
    }
    /** Destacados gratis restantes este mes (Pro y Pro Max: 1/mes). */
    async freeFeaturedLeft(userId, monthlyMax) {
        if (monthlyMax <= 0)
            return 0;
        const rows = await this.prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM wallet.billing_orders o
       JOIN wallet.billing_plans p ON p.id = o.plan_id
       WHERE o.user_id=$1::uuid AND p.code IN (${FEATURED_CODES.map((_, i) => `$${i + 2}`).join(',')})
         AND o.status='approved' AND o.amount_xaf = 0
         AND o.created_at >= date_trunc('month', now())`, userId, ...FEATURED_CODES);
        return Math.max(0, monthlyMax - rows[0].n);
    }
    /** Estado de la tienda del usuario para el banner de la app. */
    async myShopPlan(userId) {
        const quota = await this.getShopQuota(userId);
        const seller = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_sellers WHERE user_id=$1::uuid AND status='active' LIMIT 1`, userId);
        const used = seller[0] ? await this.countActiveProducts(String(seller[0].id)) : 0;
        return {
            ...quota,
            used,
            freeFeaturedLeft: await this.freeFeaturedLeft(userId, quota.monthlyFeatured),
            freeFeaturedMax: quota.monthlyFeatured,
        };
    }
    /** Dispatch de Billing: activa el derecho en Ecomerse (planes de tienda o destacados). */
    async activateEntitlement(e) {
        const code = e.code;
        if (SHOP_PLAN_CODES.includes(code))
            return { ok: true, module: 'ecomerse' };
        if (FEATURED_CODES.includes(code)) {
            if (e.targetType !== 'product' || !e.targetId) {
                throw new common_1.BadRequestException('Entitlement desconocido: falta targetType/targetId de producto');
            }
            const seller = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_sellers WHERE user_id=$1::uuid AND status='active' LIMIT 1`, e.userId);
            if (!seller[0])
                throw new common_1.BadRequestException('Entitlement desconocido: no hay tienda activa');
            const p = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_products WHERE id=$1::uuid AND seller_id=$2::uuid`, e.targetId, seller[0].id);
            if (!p[0])
                throw new common_1.BadRequestException('El producto no pertenece a tu tienda');
            // Duración del nivel de destacado (plan): 1, 2, 4, 7, 14, 21 o 30 días
            const plan = await this.prisma.$queryRawUnsafe(`SELECT duration_days FROM wallet.billing_plans WHERE code=$1`, code);
            const days = Math.max(1, Number(plan[0]?.duration_days ?? e.durationDays ?? 7));
            await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_products SET is_featured=true, featured_until=now() + ($1::int || ' days')::interval, updated_at=now() WHERE id=$2::uuid`, days, e.targetId);
            return { ok: true, module: 'ecomerse', productId: e.targetId, days };
        }
        throw new common_1.BadRequestException(`Entitlement desconocido: ${code}`);
    }
    /** Dispatch de Billing: revoca el derecho (destacar → quitar is_featured). */
    async deactivateEntitlement(e) {
        if (FEATURED_CODES.includes(e.code) && e.targetId) {
            await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_products SET is_featured=false, featured_until=NULL WHERE id=$1::uuid`, e.targetId);
            return { ok: true };
        }
        if (SHOP_PLAN_CODES.includes(e.code))
            return { ok: true }; // la cuota decae sola al expirar
        throw new common_1.BadRequestException(`Entitlement desconocido: ${e.code}`);
    }
    /** Usa el destacado GRATIS incluido en Pro/Pro Max (7 días, sin cobro).
     *  Consume el crédito mensual y registra una orden aprobada de importe 0. */
    async useFreeFeatured(userId, productId) {
        const quota = await this.getShopQuota(userId);
        if (!quota.badge || quota.monthlyFeatured <= 0) {
            throw new common_1.BadRequestException('Tu plan no incluye destacados gratis');
        }
        const left = await this.freeFeaturedLeft(userId, quota.monthlyFeatured);
        if (left <= 0)
            throw new common_1.BadRequestException('Ya usaste tus destacados gratis este mes');
        const seller = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_sellers WHERE user_id=$1::uuid AND status='active' LIMIT 1`, userId);
        if (!seller[0])
            throw new common_1.BadRequestException('No hay tienda activa');
        const p = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_products WHERE id=$1::uuid AND seller_id=$2::uuid AND status='active'`, productId, seller[0].id);
        if (!p[0])
            throw new common_1.NotFoundException('Producto no encontrado');
        // Idempotencia: un solo destacado gratis por producto y mes
        const used = await this.prisma.$queryRawUnsafe(`SELECT 1 FROM wallet.billing_orders
       WHERE user_id=$1::uuid AND target_id=$2::uuid AND module='ecomerse' AND amount_xaf=0
         AND created_at >= date_trunc('month', now()) LIMIT 1`, userId, productId);
        if (used[0])
            throw new common_1.BadRequestException('Ya destacaste este producto gratis este mes');
        const FREE_DAYS = 7;
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_products SET is_featured=true, featured_until=now() + ($1::int || ' days')::interval, updated_at=now() WHERE id=$2::uuid`, FREE_DAYS, productId);
        const lite = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.billing_plans WHERE code='ecomerse_featured_lite'`);
        if (lite[0]) {
            await this.prisma.$executeRawUnsafe(`INSERT INTO wallet.billing_orders (user_id, plan_id, module, target_type, target_id, amount_xaf, status)
         VALUES ($1::uuid, $2::uuid, 'ecomerse', 'product', $3::uuid, 0, 'approved')`, userId, lite[0].id, productId);
        }
        return { ok: true, days: FREE_DAYS };
    }
    // ------------------------------------------------------------------ LOGÍSTICA POR ZONAS
    /** Zonas de entrega predefinidas (tarifa base + por km), filtrables por ciudad. */
    async deliveryZones(city) {
        const cond = city ? `WHERE active=true AND city ILIKE $1` : `WHERE active=true`;
        const params = city ? [`%${city}%`] : [];
        const rows = await this.prisma.$queryRawUnsafe(`SELECT * FROM wallet.ecomerse_delivery_zones ${cond} ORDER BY city, sort_order`, ...params);
        return rows.map((r) => ({
            id: String(r.id), city: r.city, zoneCode: r.zone_code, label: r.label,
            baseFeeXaf: Number(r.base_fee_xaf), perKmXaf: Number(r.per_km_xaf), kmDefault: Number(r.km_default),
        }));
    }
    /** Cotiza la tarifa logística: tarifa mínima fija + incremento por km (zona). */
    async quoteLogistics(deliveryZoneId, km) {
        if (!deliveryZoneId)
            return { feeXaf: 0, breakdown: null };
        const rows = await this.prisma.$queryRawUnsafe(`SELECT * FROM wallet.ecomerse_delivery_zones WHERE id=$1::uuid AND active=true`, deliveryZoneId);
        if (!rows[0])
            throw new common_1.BadRequestException('Zona de entrega inválida');
        const z = rows[0];
        const kms = Math.max(1, Number(km ?? z.km_default ?? 2));
        const fee = Number(z.base_fee_xaf) + Number(z.per_km_xaf) * kms;
        return { feeXaf: fee, breakdown: { zone: z.label, baseFeeXaf: Number(z.base_fee_xaf), perKmXaf: Number(z.per_km_xaf), km: kms } };
    }
    /** Admin: ajusta montos de las zonas (base/por km/km default). */
    async adminUpdateZone(adminId, zoneId, body) {
        const baseFee = Number(body?.baseFeeXaf);
        const perKm = Number(body?.perKmXaf);
        const kmDefault = Number(body?.kmDefault);
        if (!Number.isFinite(baseFee) || !Number.isFinite(perKm) || !Number.isFinite(kmDefault) || baseFee < 0 || perKm < 0 || kmDefault < 1) {
            throw new common_1.BadRequestException('Montos inválidos (baseFeeXaf ≥ 0, perKmXaf ≥ 0, kmDefault ≥ 1)');
        }
        await this.prisma.$executeRawUnsafe(`UPDATE wallet.ecomerse_delivery_zones SET base_fee_xaf=$2, per_km_xaf=$3, km_default=$4, updated_at=now() WHERE id=$1::uuid`, zoneId, Math.round(baseFee), Math.round(perKm), Math.round(kmDefault));
        return { message: 'Zona actualizada' };
    }
    /** Métricas de la tienda para el panel admin (ingresos logísticos, destacados). */
    async adminStats() {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT
         (SELECT COALESCE(sum(logistics_fee_xaf),0)::int FROM wallet.ecomerse_orders WHERE logistics_fee_xaf > 0) AS logistics_income,
         (SELECT count(*)::int FROM wallet.ecomerse_products WHERE is_featured=true AND (featured_until IS NULL OR featured_until > now())) AS featured_active,
         (SELECT count(*)::int FROM wallet.ecomerse_orders WHERE fulfillment_type='agent') AS agent_orders`);
        return {
            logisticsIncomeXaf: rows[0].logistics_income,
            featuredActive: rows[0].featured_active,
            agentOrders: rows[0].agent_orders,
        };
    }
    // ------------------------------------------------------------------ LEADS DE CONTACTO (v4.4)
    /** Registra el intento de contacto fuera del funnel (WhatsApp/llamada).
     *  Sin fricción: fire-and-forget desde la app; solo da visibilidad. */
    async recordContactIntent(userId, productId, channel) {
        const ch = channel === 'call' ? 'call' : 'whatsapp';
        const p = await this.prisma.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_products WHERE id=$1::uuid`, productId);
        if (!p[0])
            throw new common_1.NotFoundException('Producto no encontrado');
        await this.prisma.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_contact_leads (user_id, product_id, channel) VALUES ($1::uuid, $2::uuid, $3)`, userId, productId, ch);
        return { ok: true };
    }
    // ------------------------------------------------------------------ FAVORITOS
    /** Toggle corazón (Xianyu): añade o quita el favorito y devuelve el estado. */
    async toggleFavorite(userId, productId) {
        if (!FLAG.f1)
            throw new common_1.BadRequestException('Ecomerse no está habilitado');
        return this.prisma.$transaction(async (tx) => {
            const p = await tx.$queryRawUnsafe(`SELECT id FROM wallet.ecomerse_products WHERE id=$1::uuid AND status='active'`, productId);
            if (!p[0])
                throw new common_1.NotFoundException('Producto no encontrado');
            const existing = await tx.$queryRawUnsafe(`SELECT 1 FROM wallet.ecomerse_favorites WHERE user_id=$1::uuid AND product_id=$2::uuid`, userId, productId);
            if (existing[0]) {
                await tx.$executeRawUnsafe(`DELETE FROM wallet.ecomerse_favorites WHERE user_id=$1::uuid AND product_id=$2::uuid`, userId, productId);
            }
            else {
                await tx.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_favorites (user_id, product_id) VALUES ($1::uuid, $2::uuid)`, userId, productId);
            }
            const cnt = await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM wallet.ecomerse_favorites WHERE product_id=$1::uuid`, productId);
            return { favorited: !existing[0], favoriteCount: cnt[0].n };
        });
    }
    /** 特别关注: marca/desmarca un favorito como especial (solo si ya está en favoritos). */
    async toggleSpecialFavorite(userId, productId) {
        const rows = await this.prisma.$queryRawUnsafe(`UPDATE wallet.ecomerse_favorites SET special = NOT special
       WHERE user_id=$1::uuid AND product_id=$2::uuid
       RETURNING special`, userId, productId);
        if (!rows[0])
            throw new common_1.NotFoundException('El producto no está en tus favoritos');
        return { special: rows[0].special === true || rows[0].special === 't' };
    }
    async favoriteIds(userId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT product_id FROM wallet.ecomerse_favorites WHERE user_id=$1::uuid ORDER BY created_at DESC`, userId);
        return rows.map((r) => String(r.product_id));
    }
    /** Favoritos con pestañas estilo Xianyu: 全部 / 上新 / 分类 / 特别关注.
     *  q.special=1 → solo especiales · q.category → filtra por categoría ·
     *  q.sort=new → ordena por novedad del producto (上新). */
    async myFavorites(userId, q = {}) {
        if (!FLAG.f1)
            throw new common_1.BadRequestException('Ecomerse no está habilitado');
        const conds = [`f.user_id=$1::uuid`, `p.status='active'`, `s.status='active'`];
        const params = [userId];
        const P = (v) => { params.push(v); return `$${params.length}`; };
        if (q.special === '1')
            conds.push(`f.special=true`);
        /* Apunta a la FAMILIA del anuncio, que es lo que el árbol viejo llamaba «la categoría». La
           columna vieja `p.category_id` sigue en la tabla pero ya no la escribe nadie: filtrar por ella
           devolvería vacío sin dar error, y eso se lee como «no tienes favoritos». */
        if (q.category)
            conds.push(`p.family_id=$2::uuid`.replace('$2', P(q.category)));
        const orderBy = q.sort === 'new' ? 'p.created_at DESC' : 'f.created_at DESC';
        const rows = await this.prisma.$queryRawUnsafe(`SELECT p.*, f.special AS is_special, s.business_name, s.rating_avg, s.rating_count,
              s.city AS seller_city,
              ${this.camposDeArbol()},
              (SELECT count(*) FROM wallet.ecomerse_favorites fc WHERE fc.product_id = p.id) AS favorite_count
       FROM wallet.ecomerse_favorites f
       JOIN wallet.ecomerse_products p ON p.id = f.product_id
       JOIN wallet.ecomerse_sellers s ON s.id = p.seller_id
       ${this.joinsDeArbol('p')}
       WHERE ${conds.join(' AND ')}
       ORDER BY ${orderBy}`, ...params);
        return rows.map((r) => ({ ...this.mapProduct(r), isSpecial: r.is_special === true || r.is_special === 't' }));
    }
    /** 买过: productos que el usuario ha comprado (pedidos no cancelados). */
    async myPurchased(userId) {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT DISTINCT p.*, s.business_name, s.rating_avg, s.rating_count, s.city AS seller_city,
              ${this.camposDeArbol()}, o.created_at AS bought_at
       FROM wallet.ecomerse_orders o
       JOIN jsonb_array_elements(o.items) AS it ON true
       JOIN wallet.ecomerse_products p ON p.id = (it->>'productId')::uuid
       JOIN wallet.ecomerse_sellers s ON s.id = p.seller_id
       ${this.joinsDeArbol('p')}
       WHERE o.buyer_id=$1::uuid AND o.status NOT IN ('cancelled','expired')
       ORDER BY bought_at DESC`, userId);
        return rows.map((r) => this.mapProduct(r));
    }
    // ------------------------------------------------------------------ BÚSQUEDA POR IMAGEN
    /** Embedding L2-normalizado de un buffer de imagen (mobilenet v1 0.25). */
    async embedBuffer(buffer) {
        const model = await getImgModel();
        const decoded = tf.node.decodeImage(new Uint8Array(buffer), 3);
        const resized = tf.image.resizeBilinear(decoded, [224, 224]);
        const norm = tf.div(tf.sub(resized.toFloat(), 127.5), 127.5);
        const batched = norm.expandDims(0);
        const pred = model.predict(batched);
        const raw = Array.from(await pred.data());
        tf.dispose([decoded, resized, norm, batched, pred]);
        const len = Math.sqrt(raw.reduce((a, b) => a + b * b, 0)) || 1;
        return raw.map((v) => v / len);
    }
    /** Calcula y guarda (upsert) el embedding del producto a partir de su 1ª foto. */
    async embedProduct(productId, photoUrl) {
        if (!FLAG.imageSearch)
            return;
        const res = await fetch(photoUrl, { signal: AbortSignal.timeout(20000) });
        if (!res.ok)
            throw new Error(`Foto inaccesible (${res.status})`);
        const buf = Buffer.from(await res.arrayBuffer());
        const vec = await this.embedBuffer(buf);
        await this.prisma.$executeRawUnsafe(`INSERT INTO wallet.ecomerse_product_embeddings (product_id, model, vector, updated_at)
       VALUES ($1::uuid, $2, $3::float8[], now())
       ON CONFLICT (product_id) DO UPDATE SET vector=EXCLUDED.vector, model=EXCLUDED.model, updated_at=now()`, productId, IMG_MODEL_NAME, vec);
    }
    /** Busca productos por similitud visual (coseno sobre embeddings). */
    async searchByImage(_userId, file) {
        if (!FLAG.f1)
            throw new common_1.BadRequestException('Ecomerse no está habilitado');
        if (!FLAG.imageSearch)
            throw new common_1.BadRequestException('Búsqueda por imagen deshabilitada');
        if (!file?.buffer?.length)
            throw new common_1.BadRequestException('Imagen requerida (campo multipart "image")');
        let vec;
        try {
            vec = await this.embedBuffer(file.buffer);
        }
        catch {
            throw new common_1.BadRequestException('No se pudo procesar la imagen. Prueba con otra foto más nítida.');
        }
        const rows = await this.prisma.$queryRawUnsafe(`SELECT e.product_id, e.vector FROM wallet.ecomerse_product_embeddings e
       JOIN wallet.ecomerse_products p ON p.id = e.product_id
       JOIN wallet.ecomerse_sellers s ON s.id = p.seller_id
       WHERE p.status='active' AND s.status='active'`);
        const scored = [];
        for (const r of rows) {
            const v = r.vector ?? [];
            if (!Array.isArray(v) || v.length !== vec.length)
                continue;
            let dot = 0;
            for (let i = 0; i < v.length; i++)
                dot += (v[i] ?? 0) * vec[i];
            scored.push({ id: String(r.product_id), score: dot });
        }
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, 20).filter((x) => x.score >= IMG_MATCH_MIN);
        if (!top.length)
            return { query: 'image', total: 0, products: [] };
        const ids = top.map((x) => x.id);
        const rows2 = await this.prisma.$queryRawUnsafe(`SELECT p.*, s.business_name, s.rating_avg, s.rating_count, s.city AS seller_city,
              ${this.camposDeArbol()},
              (SELECT count(*) FROM wallet.ecomerse_favorites f WHERE f.product_id = p.id) AS favorite_count
       FROM wallet.ecomerse_products p
       JOIN wallet.ecomerse_sellers s ON s.id = p.seller_id
       ${this.joinsDeArbol('p')}
       WHERE p.id IN (${ids.map((_, j) => `$${j + 1}::uuid`).join(',')})`, ...ids);
        const byId = new Map(rows2.map((r) => [String(r.id), r]));
        const products = top
            .map((t) => {
            const r = byId.get(t.id);
            return r ? { ...this.mapProduct(r), matchScore: Number(t.score.toFixed(3)) } : null;
        })
            .filter((x) => x !== null);
        return { query: 'image', total: products.length, products };
    }
    /** Backfill de embeddings para productos existentes (admin). */
    async adminBackfillEmbeddings() {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT id, photos FROM wallet.ecomerse_products
       WHERE photos IS NOT NULL AND photos::text <> '[]'::text`);
        let done = 0, failed = 0, skipped = 0;
        for (const r of rows) {
            const photos = r.photos ?? [];
            const first = photos[0];
            if (!first) {
                skipped++;
                continue;
            }
            try {
                await this.embedProduct(String(r.id), first);
                done++;
            }
            catch {
                failed++;
            }
        }
        return { total: rows.length, done, failed, skipped };
    }
    async adminEmbeddingsStatus() {
        const rows = await this.prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM wallet.ecomerse_product_embeddings`);
        return { count: rows[0].n, model: IMG_MODEL_NAME };
    }
    mapOrder(r) {
        return {
            id: String(r.id), buyerId: String(r.buyer_id), sellerId: String(r.seller_id),
            sellerName: r.business_name ?? null, sellerPhone: r.phone_contact ?? null,
            items: r.items ?? [], totalXaf: Number(r.total_xaf), paymentMethod: r.payment_method,
            logisticsFeeXaf: Number(r.logistics_fee_xaf ?? 0),
            deliveryZoneId: r.delivery_zone_id ? String(r.delivery_zone_id) : null,
            deliveryZone: r.delivery_zone_label ?? null, deliveryKm: r.delivery_km ?? null,
            billingOrderId: r.billing_order_id ? String(r.billing_order_id) : null,
            status: r.status, deliveryAddress: r.delivery_address ?? null, note: r.note ?? null,
            deliveredAt: r.delivered_at ?? null, warrantyExpiresAt: r.warranty_expires_at ?? null,
            openDisputes: Number(r.open_disputes ?? 0),
            reviewed: Number(r.reviewed ?? 0) > 0,
            fulfillmentType: r.fulfillment_type ?? 'seller',
            cancelledAt: r.cancelled_at ?? null, cancellationReason: r.cancellation_reason ?? null,
            createdAt: r.created_at,
        };
    }
};
exports.EcomerseService = EcomerseService;
exports.EcomerseService = EcomerseService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => billing_service_1.BillingService))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        mobility_prisma_service_1.MobilityPrismaService,
        billing_service_1.BillingService,
        sms_service_1.SmsService,
        ecomerse_storage_service_1.EcomerseStorageService,
        wallet_service_1.WalletService])
], EcomerseService);
//# sourceMappingURL=ecomerse.service.js.map