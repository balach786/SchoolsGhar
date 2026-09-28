"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUDIT_ACTIONS = void 0;
exports.recordAudit = recordAudit;
exports.recordAuditWithSession = recordAuditWithSession;
var mongoose_1 = __importDefault(require("mongoose"));
var AuditLog_1 = require("../models/AuditLog");
var logger_1 = require("../utils/logger");
/**
 * Audit writer — fire-and-forget, compact records only.
 * Failures to write an audit entry must never break the main operation.
 * Hardened in Phase 4A to FAIL CLOSED on invalid tenant audit writes.
 */
function recordAudit(module, action, actor, targetId, metadata, explicitScope, targetTenantId) {
    var _this = this;
    try {
        var resolvedTenantId_1;
        var resolvedScope_1;
        // 1. Canonical Actor Authority: if actor belongs to a tenant, it is authoritative
        if (actor === null || actor === void 0 ? void 0 : actor.tenantId) {
            resolvedTenantId_1 = mongoose_1.default.isValidObjectId(actor.tenantId)
                ? new mongoose_1.default.Types.ObjectId(String(actor.tenantId))
                : undefined;
            resolvedScope_1 = 'tenant';
        }
        else if ((actor === null || actor === void 0 ? void 0 : actor.isPlatformAdmin) && targetTenantId) {
            // 2. Platform Admin Acting on Tenant (explicit server-controlled targetTenantId only)
            resolvedTenantId_1 = mongoose_1.default.isValidObjectId(targetTenantId)
                ? new mongoose_1.default.Types.ObjectId(String(targetTenantId))
                : undefined;
            resolvedScope_1 = 'tenant';
        }
        else if (explicitScope === 'tenant') {
            // Explicit tenant request but actor has no tenantId and no targetTenantId was provided
            if (targetTenantId && mongoose_1.default.isValidObjectId(targetTenantId)) {
                resolvedTenantId_1 = new mongoose_1.default.Types.ObjectId(String(targetTenantId));
                resolvedScope_1 = 'tenant';
            }
            else {
                // FAIL CLOSED: do NOT silently demote to platform
                logger_1.logger.warn("Security Warning: Tenant-scoped audit write rejected - no valid tenant context (".concat(module, ".").concat(action, ")"));
                return;
            }
        }
        else if (explicitScope === 'platform' || (actor === null || actor === void 0 ? void 0 : actor.isPlatformAdmin) || !actor) {
            // 3. Platform-level action (genuinely unrelated to any tenant)
            resolvedScope_1 = 'platform';
            resolvedTenantId_1 = undefined;
        }
        else {
            // Unauthenticated or unknown context without explicit scope
            resolvedScope_1 = 'platform';
            resolvedTenantId_1 = undefined;
        }
        // Fail closed: if resolved scope is tenant, resolvedTenantId MUST be valid
        if (resolvedScope_1 === 'tenant' && !resolvedTenantId_1) {
            logger_1.logger.warn("Security Warning: Tenant-scoped audit write rejected - missing resolved tenantId (".concat(module, ".").concat(action, ")"));
            return;
        }
        var entry_1 = {
            scope: resolvedScope_1,
            tenantId: resolvedTenantId_1,
            module: module,
            action: action,
            userId: actor === null || actor === void 0 ? void 0 : actor._id,
            roleId: actor === null || actor === void 0 ? void 0 : actor.roleId,
            targetId: targetId,
            metadata: (0, AuditLog_1.sanitizeMetadata)(metadata),
            createdAt: new Date(),
        };
        var fire = function () { return __awaiter(_this, void 0, void 0, function () {
            var getTenantDb, tenantDb, getTenantModels, TenantAuditLog;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(resolvedScope_1 === 'tenant' && resolvedTenantId_1)) return [3 /*break*/, 5];
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./auth.service')); })];
                    case 1:
                        getTenantDb = (_a.sent()).getTenantDb;
                        return [4 /*yield*/, getTenantDb(String(resolvedTenantId_1))];
                    case 2:
                        tenantDb = _a.sent();
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantModelRegistry')); })];
                    case 3:
                        getTenantModels = (_a.sent()).getTenantModels;
                        TenantAuditLog = getTenantModels(tenantDb).AuditLog;
                        return [4 /*yield*/, TenantAuditLog.create(entry_1)];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, AuditLog_1.AuditLog.create(entry_1)];
                    case 6:
                        _a.sent();
                        _a.label = 7;
                    case 7: return [2 /*return*/];
                }
            });
        }); };
        fire().catch(function (err) { return logger_1.logger.warn("Audit write failed (".concat(module, ".").concat(action, ")"), err.message); });
    }
    catch (err) {
        logger_1.logger.warn("Audit write rejected (".concat(module, ".").concat(action, ")"), err instanceof Error ? err.message : 'unknown');
    }
}
/** Transactional audit logger — writes within an active MongoDB ClientSession so that if the transaction rolls back, the audit rolls back too. */
function recordAuditWithSession(module, action, actor, targetId, metadata, session, explicitScope, targetTenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var resolvedTenantId, resolvedScope, entry, ModelToUse, getTenantDb, tenantDb, getTenantModels;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (actor === null || actor === void 0 ? void 0 : actor.tenantId) {
                        resolvedTenantId = mongoose_1.default.isValidObjectId(actor.tenantId)
                            ? new mongoose_1.default.Types.ObjectId(String(actor.tenantId))
                            : undefined;
                        resolvedScope = 'tenant';
                    }
                    else if ((actor === null || actor === void 0 ? void 0 : actor.isPlatformAdmin) && targetTenantId) {
                        resolvedTenantId = mongoose_1.default.isValidObjectId(targetTenantId)
                            ? new mongoose_1.default.Types.ObjectId(String(targetTenantId))
                            : undefined;
                        resolvedScope = 'tenant';
                    }
                    else if (explicitScope === 'tenant') {
                        if (targetTenantId && mongoose_1.default.isValidObjectId(targetTenantId)) {
                            resolvedTenantId = new mongoose_1.default.Types.ObjectId(String(targetTenantId));
                            resolvedScope = 'tenant';
                        }
                        else {
                            logger_1.logger.warn("Security Warning: Tenant-scoped audit write rejected - no valid tenant context (".concat(module, ".").concat(action, ")"));
                            return [2 /*return*/];
                        }
                    }
                    else if (explicitScope === 'platform' || (actor === null || actor === void 0 ? void 0 : actor.isPlatformAdmin) || !actor) {
                        resolvedScope = 'platform';
                        resolvedTenantId = undefined;
                    }
                    else {
                        resolvedScope = 'platform';
                        resolvedTenantId = undefined;
                    }
                    if (resolvedScope === 'tenant' && !resolvedTenantId) {
                        logger_1.logger.warn("Security Warning: Tenant-scoped audit write rejected - missing resolved tenantId (".concat(module, ".").concat(action, ")"));
                        return [2 /*return*/];
                    }
                    entry = {
                        scope: resolvedScope,
                        tenantId: resolvedTenantId,
                        module: module,
                        action: action,
                        userId: actor === null || actor === void 0 ? void 0 : actor._id,
                        roleId: actor === null || actor === void 0 ? void 0 : actor.roleId,
                        targetId: targetId,
                        metadata: (0, AuditLog_1.sanitizeMetadata)(metadata),
                        createdAt: new Date(),
                    };
                    ModelToUse = AuditLog_1.AuditLog;
                    if (!(resolvedScope === 'tenant' && resolvedTenantId)) return [3 /*break*/, 4];
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./auth.service')); })];
                case 1:
                    getTenantDb = (_a.sent()).getTenantDb;
                    return [4 /*yield*/, getTenantDb(String(resolvedTenantId))];
                case 2:
                    tenantDb = _a.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantModelRegistry')); })];
                case 3:
                    getTenantModels = (_a.sent()).getTenantModels;
                    ModelToUse = getTenantModels(tenantDb).AuditLog;
                    _a.label = 4;
                case 4:
                    if (!session) return [3 /*break*/, 6];
                    return [4 /*yield*/, ModelToUse.create([entry], { session: session })];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 8];
                case 6: return [4 /*yield*/, ModelToUse.create(entry)];
                case 7:
                    _a.sent();
                    _a.label = 8;
                case 8: return [2 /*return*/];
            }
        });
    });
}
/** Audit actions used across the system (compact, consistent). */
exports.AUDIT_ACTIONS = {
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    USER_CREATED: 'USER_CREATED',
    USER_UPDATED: 'USER_UPDATED',
    USER_ACTIVATED: 'USER_ACTIVATED',
    USER_DEACTIVATED: 'USER_DEACTIVATED',
    USER_ARCHIVED: 'USER_ARCHIVED',
    USER_RESTORED: 'USER_RESTORED',
    USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
    USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
    ROLE_CREATED: 'ROLE_CREATED',
    ROLE_UPDATED: 'ROLE_UPDATED',
    ROLE_PERMISSION_UPDATED: 'ROLE_PERMISSION_UPDATED',
    PASSWORD_CHANGED: 'PASSWORD_CHANGED',
};
