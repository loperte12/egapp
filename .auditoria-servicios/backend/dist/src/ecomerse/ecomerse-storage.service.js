"use strict";
// =============================================================================
// EcomerseStorageService — fotos de productos en Bitiful S3 (bucket PRIVADO
// único `egapp-media`, prefijo de clave `ecomerse/`). Migración acta §9: un
// solo bucket por servicio y LECTURA SIEMPRE FIRMADA (presigned GET, TTL
// MINIO_READ_TTL con techo duro 604800 s) porque el bucket es privado
// (GET sin firma = 403 medido). Los buckets viejos ya no existen en Bitiful.
// =============================================================================
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EcomerseStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcomerseStorageService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const minio_1 = require("minio");
const READ_TTL = Math.min(Math.max(Number(process.env.MINIO_READ_TTL ?? 604800), 60), 604800);
let EcomerseStorageService = EcomerseStorageService_1 = class EcomerseStorageService {
    logger = new common_1.Logger(EcomerseStorageService_1.name);
    client;
    bucket = String(process.env.MINIO_BUCKET_MEDIA ?? 'egapp-media');
    signedRead = String(process.env.MINIO_SIGNED_READ ?? '') === '1';
    publicBase = process.env.MINIO_PUBLIC_BASE || 'https://egrouteplan.com/storage';
    constructor() {
        // MINIO_ENDPOINT llega CON esquema (https://s3.bitiful.net): el SDK minio
        // exige endPoint SIN esquema; el parse ya deduce useSSL/port.
        const ep = new URL(process.env.MINIO_ENDPOINT || 'http://127.0.0.1:9000');
        this.client = new minio_1.Client({
            endPoint: ep.hostname,
            port: Number(ep.port || (ep.protocol === 'https:' ? 443 : 80)),
            useSSL: ep.protocol === 'https:',
            accessKey: String(process.env.MINIO_ACCESS_KEY || 'minioadmin').trim(),
            secretKey: String(process.env.MINIO_SECRET_KEY || 'minioadmin').trim(),
            /**
             * **La región, o firmar sale a la red.** El SDK pregunta la región del bucket
             * (`GetBucketLocation`) antes de firmar si no se la dan; en la función esa llamada no
             * completa y la portada se quedaba vacía (y la sección tardaba 3 s). Con `MINIO_REGION`
             * firmar es local: ~1 ms en vez de ~470 ms.
             */
            region: process.env.MINIO_REGION || undefined,
        });
    }
    /** URL de lectura: presigned GET de larga duración (bucket privado). */
    async urlDeLectura(key) {
        if (!this.signedRead)
            return `${this.publicBase}/${this.bucket}/${key}`;
        return this.client.presignedGetObject(this.bucket, key, READ_TTL);
    }
    /** Guarda una foto (dataURL o base64) y devuelve la URL de lectura (o null). */
    async putImage(dataUrlOrB64, folder = 'products') {
        const b64 = (dataUrlOrB64 || '').includes(',') ? dataUrlOrB64.split(',')[1] : dataUrlOrB64;
        if (!b64)
            return null;
        const buf = Buffer.from(b64, 'base64');
        if (buf.length < 100)
            return null;
        const key = `ecomerse/${folder}/${(0, node_crypto_1.randomUUID)()}.jpg`;
        try {
            await this.client.putObject(this.bucket, key, buf, buf.length, {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=86400',
            });
            return await this.urlDeLectura(key);
        }
        catch (e) {
            this.logger.warn(`MinIO upload falló: ${e.message}`);
            return null;
        }
    }
    /** Guarda un buffer de imagen (upload multipart) y devuelve la URL de lectura. */
    async putImageBuffer(buf, contentType, folder = 'products') {
        if (!buf || buf.length < 100)
            return null;
        const key = `ecomerse/${folder}/${(0, node_crypto_1.randomUUID)()}.jpg`;
        try {
            await this.client.putObject(this.bucket, key, buf, buf.length, {
                'Content-Type': contentType || 'image/jpeg',
                'Cache-Control': 'public, max-age=86400',
            });
            return await this.urlDeLectura(key);
        }
        catch (e) {
            this.logger.warn(`MinIO upload falló: ${e.message}`);
            return null;
        }
    }
};
exports.EcomerseStorageService = EcomerseStorageService;
exports.EcomerseStorageService = EcomerseStorageService = EcomerseStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], EcomerseStorageService);
//# sourceMappingURL=ecomerse-storage.service.js.map