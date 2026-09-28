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
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueTokensForUser = issueTokensForUser;
exports.buildSafeAuthResponse = buildSafeAuthResponse;
exports.getTenantDb = getTenantDb;
exports.loginUser = loginUser;
exports.refreshSession = refreshSession;
exports.logoutSession = logoutSession;
exports.revokeAllSessions = revokeAllSessions;
exports.currentUserState = currentUserState;
var Tenant_1 = require("../models/Tenant");
var security_1 = require("../utils/security");
var id_1 = require("../utils/id");
var ApiError_1 = require("../utils/ApiError");
var permission_service_1 = require("./permission.service");
function issueTokensForUser(user, roleSlug, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var sessionId, refreshToken, accessToken, getTenantModels, tenantModels;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sessionId = (0, id_1.randomToken)(16);
                    refreshToken = (0, security_1.signRefreshToken)({
                        sub: String(user._id),
                        type: 'refresh',
                        sid: sessionId,
                        tenantId: user.tenantId ? String(user.tenantId) : undefined
                    });
                    accessToken = (0, security_1.signAccessToken)({
                        sub: String(user._id),
                        role: roleSlug,
                        roleId: String(user.roleId),
                        email: user.email,
                        name: user.name,
                        tenantId: user.tenantId ? String(user.tenantId) : undefined,
                        isPlatformAdmin: Boolean(user.isPlatformAdmin),
                        type: 'access',
                    });
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantModelRegistry')); })];
                case 1:
                    getTenantModels = (_a.sent()).getTenantModels;
                    tenantModels = getTenantModels(tenantDb);
                    return [4 /*yield*/, tenantModels.AuthSession.create({
                            user: user._id,
                            tokenHash: (0, security_1.hashToken)(refreshToken),
                            expiresAt: new Date(Date.now() + (0, security_1.refreshTokenTtlMs)(refreshToken)),
                        })];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { accessToken: accessToken, refreshToken: refreshToken, sessionId: sessionId }];
            }
        });
    });
}
function buildSafeAuthResponse(user, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var role, roleSlug, permissions, tokens;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, permission_service_1.effectiveRole)(String(user.roleId), user.tenantId ? String(user.tenantId) : undefined, tenantDb)];
                case 1:
                    role = _d.sent();
                    if (!(role === null || role === void 0 ? void 0 : role.isActive))
                        throw ApiError_1.ApiError.forbidden('Your role is not active. Contact your administrator.', 'ROLE_INACTIVE');
                    roleSlug = role.slug;
                    return [4 /*yield*/, (0, permission_service_1.getRolePermissionMap)(String(user.roleId), roleSlug, user.tenantId ? String(user.tenantId) : undefined, tenantDb)];
                case 2:
                    permissions = _d.sent();
                    return [4 /*yield*/, issueTokensForUser(user, roleSlug, tenantDb)];
                case 3:
                    tokens = _d.sent();
                    return [2 /*return*/, {
                            user: {
                                _id: String(user._id),
                                name: user.name,
                                email: user.email,
                                roleId: String(user.roleId),
                                role: roleSlug,
                                roleLabel: (_a = role === null || role === void 0 ? void 0 : role.name) !== null && _a !== void 0 ? _a : roleSlug,
                                tenantId: user.tenantId ? String(user.tenantId) : null,
                                isPlatformAdmin: Boolean(user.isPlatformAdmin),
                                isActive: user.isActive,
                                lastLoginAt: (_b = user.lastLoginAt) !== null && _b !== void 0 ? _b : null,
                                permissions: permissions,
                                dashboardOrder: (_c = user.dashboardOrder) !== null && _c !== void 0 ? _c : [],
                            },
                            accessToken: tokens.accessToken,
                            refreshToken: tokens.refreshToken,
                        }];
            }
        });
    });
}
function getTenantDb(tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var getTenantConnection, getMasterConnection, getMasterModels, env, masterDb, masterModels, tenant, dbName;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantConnectionManager')); })];
                case 1:
                    getTenantConnection = (_a.sent()).getTenantConnection;
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./MasterConnectionManager')); })];
                case 2:
                    getMasterConnection = (_a.sent()).getMasterConnection;
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./MasterModelRegistry')); })];
                case 3:
                    getMasterModels = (_a.sent()).getMasterModels;
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('../config/env')); })];
                case 4:
                    env = (_a.sent()).env;
                    if (!tenantId) {
                        return [2 /*return*/, getMasterConnection()];
                    }
                    masterDb = getMasterConnection();
                    masterModels = getMasterModels(masterDb);
                    return [4 /*yield*/, masterModels.Tenant.findById(tenantId)];
                case 5:
                    tenant = _a.sent();
                    if (!!tenant) return [3 /*break*/, 7];
                    return [4 /*yield*/, Tenant_1.Tenant.findById(tenantId)];
                case 6:
                    tenant = _a.sent();
                    _a.label = 7;
                case 7:
                    dbName = tenant === null || tenant === void 0 ? void 0 : tenant.databaseName;
                    if (!(tenant === null || tenant === void 0 ? void 0 : tenant.isDatabaseProvisioned) || !dbName) {
                        throw new Error('School account is not fully provisioned yet.');
                    }
                    return [2 /*return*/, getTenantConnection(dbName)];
            }
        });
    });
}
/** Authenticate using Phase 2 School Code + Email + Password */
function loginUser(schoolCode, email, password) {
    return __awaiter(this, void 0, void 0, function () {
        var getMasterConnection, getMasterModels, getTenantModels, getTenantConnection, env, masterDb, masterModels, tenant, dbName, tenantDb, tenantModels, user, passwordOk, role;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./MasterConnectionManager')); })];
                case 1:
                    getMasterConnection = (_a.sent()).getMasterConnection;
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./MasterModelRegistry')); })];
                case 2:
                    getMasterModels = (_a.sent()).getMasterModels;
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantModelRegistry')); })];
                case 3:
                    getTenantModels = (_a.sent()).getTenantModels;
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantConnectionManager')); })];
                case 4:
                    getTenantConnection = (_a.sent()).getTenantConnection;
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('../config/env')); })];
                case 5:
                    env = (_a.sent()).env;
                    masterDb = getMasterConnection();
                    masterModels = getMasterModels(masterDb);
                    return [4 /*yield*/, masterModels.Tenant.findOne({ slug: schoolCode.toLowerCase() })];
                case 6:
                    tenant = _a.sent();
                    if (!!tenant) return [3 /*break*/, 8];
                    return [4 /*yield*/, Tenant_1.Tenant.findOne({ slug: schoolCode.toLowerCase() })];
                case 7:
                    // TRANSITION COMPATIBILITY: Fallback to legacy default connection for old dummy tenants
                    tenant = _a.sent();
                    _a.label = 8;
                case 8:
                    if (!tenant) {
                        throw ApiError_1.ApiError.unauthorized('Invalid school code or credentials', 'INVALID_CREDENTIALS');
                    }
                    if (tenant.isDeleted) {
                        throw ApiError_1.ApiError.forbidden('School account has been deleted.', 'TENANT_DELETED');
                    }
                    if (tenant.isSuspended) {
                        throw ApiError_1.ApiError.forbidden('School account is suspended.', 'TENANT_SUSPENDED');
                    }
                    if (tenant.provisioningStatus === 'failed') {
                        throw ApiError_1.ApiError.unauthorized('School account provisioning failed. Please contact support.', 'PROVISIONING_FAILED');
                    }
                    dbName = tenant.databaseName;
                    if (!tenant.isDatabaseProvisioned || !dbName) {
                        throw ApiError_1.ApiError.unauthorized('School account is not fully provisioned yet.', 'PROVISIONING_PENDING');
                    }
                    tenantDb = getTenantConnection(dbName);
                    tenantModels = getTenantModels(tenantDb);
                    return [4 /*yield*/, tenantModels.User.findOne({ email: email, isArchived: false }).select('+passwordHash')];
                case 9:
                    user = _a.sent();
                    if (!user) {
                        throw ApiError_1.ApiError.unauthorized('Invalid school code or credentials', 'INVALID_CREDENTIALS');
                    }
                    // TRANSITION COMPATIBILITY: Since all tenants currently share 'schoolsghar', 
                    // ensure the matched user actually belongs to the resolved tenant.
                    if (user.tenantId && String(user.tenantId) !== String(tenant._id)) {
                        throw ApiError_1.ApiError.unauthorized('Invalid school code or credentials', 'INVALID_CREDENTIALS');
                    }
                    return [4 /*yield*/, (0, security_1.verifyPassword)(password, user.passwordHash)];
                case 10:
                    passwordOk = _a.sent();
                    if (!passwordOk) {
                        throw ApiError_1.ApiError.unauthorized('Invalid school code or credentials', 'INVALID_CREDENTIALS');
                    }
                    if (!user.isActive) {
                        throw ApiError_1.ApiError.forbidden('Your account has been deactivated. Please contact the administrator.', 'ACCOUNT_INACTIVE');
                    }
                    return [4 /*yield*/, (0, permission_service_1.effectiveRole)(String(user.roleId), user.tenantId ? String(user.tenantId) : undefined, tenantDb)];
                case 11:
                    role = _a.sent();
                    if (!role || !role.isActive) {
                        throw ApiError_1.ApiError.forbidden('Your role is not active. Please contact the administrator.', 'ROLE_INACTIVE');
                    }
                    user.lastLoginAt = new Date();
                    return [4 /*yield*/, user.save()];
                case 12:
                    _a.sent();
                    return [2 /*return*/, buildSafeAuthResponse(user, tenantDb)];
            }
        });
    });
}
/** Refresh: verify token, find live session, rotate, return fresh pair. */
function refreshSession(refreshToken) {
    return __awaiter(this, void 0, void 0, function () {
        var payload, tenantDb, getTenantModels, tenantModels, tokenHash, session, GRACE_PERIOD_MS, user;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    try {
                        payload = (0, security_1.verifyRefreshToken)(refreshToken);
                    }
                    catch (_b) {
                        throw ApiError_1.ApiError.unauthorized('Session expired. Please sign in again.', 'REFRESH_EXPIRED');
                    }
                    return [4 /*yield*/, getTenantDb(payload.tenantId)];
                case 1:
                    tenantDb = _a.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantModelRegistry')); })];
                case 2:
                    getTenantModels = (_a.sent()).getTenantModels;
                    tenantModels = getTenantModels(tenantDb);
                    tokenHash = (0, security_1.hashToken)(refreshToken);
                    return [4 /*yield*/, tenantModels.AuthSession.findOne({ tokenHash: tokenHash })];
                case 3:
                    session = _a.sent();
                    if (!session) {
                        throw ApiError_1.ApiError.unauthorized('Session expired. Please sign in again.', 'REFRESH_EXPIRED');
                    }
                    if (!session.revokedAt) return [3 /*break*/, 5];
                    GRACE_PERIOD_MS = 15000;
                    if (!(Date.now() - session.revokedAt.getTime() > GRACE_PERIOD_MS)) return [3 /*break*/, 5];
                    return [4 /*yield*/, tenantModels.AuthSession.updateMany({ user: session.user, revokedAt: null }, { $set: { revokedAt: new Date() } })];
                case 4:
                    _a.sent();
                    throw ApiError_1.ApiError.unauthorized('Session expired. Please sign in again.', 'REFRESH_REUSED');
                case 5:
                    if (session.expiresAt.getTime() < Date.now()) {
                        throw ApiError_1.ApiError.unauthorized('Session expired. Please sign in again.', 'REFRESH_EXPIRED');
                    }
                    return [4 /*yield*/, tenantModels.User.findById(session.user)];
                case 6:
                    user = _a.sent();
                    if (!user || user.isArchived || !user.isActive) {
                        throw ApiError_1.ApiError.unauthorized('Account is no longer active', 'ACCOUNT_INACTIVE');
                    }
                    session.revokedAt = new Date();
                    return [4 /*yield*/, session.save()];
                case 7:
                    _a.sent();
                    return [2 /*return*/, buildSafeAuthResponse(user, tenantDb)];
            }
        });
    });
}
/** Logout: revoke the presented refresh token's session. */
function logoutSession(refreshToken) {
    return __awaiter(this, void 0, void 0, function () {
        var payload, tenantDb, getTenantModels, tenantModels, tokenHash, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 5]);
                    payload = (0, security_1.verifyRefreshToken)(refreshToken);
                    return [4 /*yield*/, getTenantDb(payload.tenantId)];
                case 1:
                    tenantDb = _b.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantModelRegistry')); })];
                case 2:
                    getTenantModels = (_b.sent()).getTenantModels;
                    tenantModels = getTenantModels(tenantDb);
                    tokenHash = (0, security_1.hashToken)(refreshToken);
                    return [4 /*yield*/, tenantModels.AuthSession.updateOne({ tokenHash: tokenHash }, { $set: { revokedAt: new Date() } })];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function revokeAllSessions(userId, tenantDb, keepSessionId) {
    return __awaiter(this, void 0, void 0, function () {
        var getTenantModels, tenantModels;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantModelRegistry')); })];
                case 1:
                    getTenantModels = (_a.sent()).getTenantModels;
                    tenantModels = getTenantModels(tenantDb);
                    return [4 /*yield*/, tenantModels.AuthSession.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } })];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/** Current-user state: fresh from MongoDB — reflects latest permission changes. */
function currentUserState(userId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var getTenantModels, tenantModels, user, getMasterConnection, getMasterModels, masterDb, masterModels, tenantExists, role, roleSlug, permissions;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantModelRegistry')); })];
                case 1:
                    getTenantModels = (_d.sent()).getTenantModels;
                    tenantModels = getTenantModels(tenantDb);
                    return [4 /*yield*/, tenantModels.User.findById(userId).where('isArchived').equals(false)];
                case 2:
                    user = _d.sent();
                    if (!user)
                        throw ApiError_1.ApiError.notFound('User not found');
                    if (!user.isActive)
                        throw ApiError_1.ApiError.forbidden('Your account has been deactivated.', 'ACCOUNT_INACTIVE');
                    if (!user.tenantId) return [3 /*break*/, 8];
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./MasterConnectionManager')); })];
                case 3:
                    getMasterConnection = (_d.sent()).getMasterConnection;
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./MasterModelRegistry')); })];
                case 4:
                    getMasterModels = (_d.sent()).getMasterModels;
                    masterDb = getMasterConnection();
                    masterModels = getMasterModels(masterDb);
                    return [4 /*yield*/, masterModels.Tenant.exists({ _id: user.tenantId })];
                case 5:
                    tenantExists = _d.sent();
                    if (!!tenantExists) return [3 /*break*/, 7];
                    return [4 /*yield*/, Tenant_1.Tenant.exists({ _id: user.tenantId })];
                case 6:
                    tenantExists = _d.sent();
                    _d.label = 7;
                case 7:
                    if (!tenantExists)
                        throw ApiError_1.ApiError.unauthorized('School tenant no longer exists. Please sign in again.');
                    _d.label = 8;
                case 8: return [4 /*yield*/, (0, permission_service_1.effectiveRole)(String(user.roleId), user.tenantId ? String(user.tenantId) : undefined, tenantDb)];
                case 9:
                    role = _d.sent();
                    if (!(role === null || role === void 0 ? void 0 : role.isActive))
                        throw ApiError_1.ApiError.forbidden('Your role is not active. Contact your administrator.', 'ROLE_INACTIVE');
                    roleSlug = role.slug;
                    return [4 /*yield*/, (0, permission_service_1.getRolePermissionMap)(String(user.roleId), roleSlug, user.tenantId ? String(user.tenantId) : undefined, tenantDb)];
                case 10:
                    permissions = _d.sent();
                    return [2 /*return*/, {
                            _id: String(user._id),
                            name: user.name,
                            email: user.email,
                            roleId: String(user.roleId),
                            role: roleSlug,
                            roleLabel: (_a = role === null || role === void 0 ? void 0 : role.name) !== null && _a !== void 0 ? _a : roleSlug,
                            tenantId: user.tenantId ? String(user.tenantId) : null,
                            isPlatformAdmin: Boolean(user.isPlatformAdmin),
                            isActive: user.isActive,
                            lastLoginAt: (_b = user.lastLoginAt) !== null && _b !== void 0 ? _b : null,
                            permissions: permissions,
                            dashboardOrder: (_c = user.dashboardOrder) !== null && _c !== void 0 ? _c : [],
                        }];
            }
        });
    });
}
