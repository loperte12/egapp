"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcomerseModule = void 0;
const common_1 = require("@nestjs/common");
const ecomerse_controller_1 = require("./ecomerse.controller");
// 15/10: la UI del Mercado (las franjas que sirve el servidor: `ui/home` y `ui/detail`).
const ecomerse_ui_controller_1 = require("./ecomerse-ui.controller");
const ecomerse_service_1 = require("./ecomerse.service");
const ecomerse_storage_service_1 = require("./ecomerse-storage.service");
const prisma_service_1 = require("../http/prisma.service");
const sms_service_1 = require("../http/sms.service");
const mobility_module_1 = require("../mobility/mobility.module");
const billing_module_1 = require("../billing/billing.module");
// 17/09 (parche 101): el monedero cobra los pedidos de Ecomerse. Estas dependencias viven en el
// módulo raíz y hay que declararlas AQUÍ (un módulo no ve los providers de otro). Sin estado propio.
const wallet_service_1 = require("../services/wallet.service");
const payment_auth_service_1 = require("../services/payment-auth.service");
const fee_service_1 = require("../services/fee.service");
const kyc_gate_service_1 = require("../services/kyc-gate.service");
let EcomerseModule = class EcomerseModule {
};
exports.EcomerseModule = EcomerseModule;
exports.EcomerseModule = EcomerseModule = __decorate([
    (0, common_1.Module)({
        // forwardRef: BillingModule importa EcomerseModule (dispatch de entitlements)
        // y EcomerseService usa BillingService (órdenes billing) → ciclo controlado.
        imports: [mobility_module_1.MobilityModule, (0, common_1.forwardRef)(() => billing_module_1.BillingModule)],
        controllers: [ecomerse_controller_1.EcomerseController, ecomerse_controller_1.EcomerseAdminExpiryController, ecomerse_ui_controller_1.EcomerseUiController],
        providers: [
            ecomerse_service_1.EcomerseService, ecomerse_storage_service_1.EcomerseStorageService, prisma_service_1.PrismaService, sms_service_1.SmsService,
            wallet_service_1.WalletService, payment_auth_service_1.PaymentAuthService, fee_service_1.FeeService, kyc_gate_service_1.KycGateService,
        ],
        exports: [ecomerse_service_1.EcomerseService],
    })
], EcomerseModule);