"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.effectiveRole = effectiveRole;
exports.buildEffectivePermissionMap = buildEffectivePermissionMap;
exports.isPermissionSubset = isPermissionSubset;
exports.getRolePermissionMap = getRolePermissionMap;
exports.hasPermission = hasPermission;
exports.invalidatePermissionCache = invalidatePermissionCache;
var Role_1 = require("../models/Role");
var TenantRoleOverride_1 = require("../models/TenantRoleOverride");
var permissions_1 = require("../config/permissions");
/**
 * Resolves the live effective role directly from MongoDB.
 * Merges system or custom Role definition with any tenant-specific override.
 * Process-local cache is NOT used in authorization.
 */
function mergePermissions(core, override) {
    var map = new Map();
    __spreadArray(__spreadArray([], (core || []), true), (override || []), true).forEach(function (entry) {
        if (!map.has(entry.module))
            map.set(entry.module, new Set());
        (entry.actions || []).forEach(function (a) { return map.get(entry.module).add(a); });
    });
    return Array.from(map.entries()).map(function (_a) {
        var module = _a[0], actions = _a[1];
        return ({
            module: module,
            actions: Array.from(actions),
        });
    });
}
function effectiveRole(roleId, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var role, getTenantModels, tenantModels, override, _a, corePerms;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (!tenantDb) return [3 /*break*/, 3];
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require('./TenantModelRegistry')); })];
                case 1:
                    getTenantModels = (_e.sent()).getTenantModels;
                    tenantModels = getTenantModels(tenantDb);
                    return [4 /*yield*/, tenantModels.Role.findById(roleId).lean()];
                case 2:
                    role = _e.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, Role_1.Role.findById(roleId).lean()];
                case 4:
                    role = _e.sent();
                    _e.label = 5;
                case 5:
                    if (!role || (role.tenantId && String(role.tenantId) !== tenantId)) {
                        return [2 /*return*/, null];
                    }
                    if (!tenantId) return [3 /*break*/, 7];
                    return [4 /*yield*/, TenantRoleOverride_1.TenantRoleOverride.findOne({ roleId: roleId, tenantId: tenantId }).lean()];
                case 6:
                    _a = _e.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _a = null;
                    _e.label = 8;
                case 8:
                    override = _a;
                    corePerms = (role.slug === permissions_1.ROLE_SLUGS.superAdmin || role.slug === permissions_1.ROLE_SLUGS.admin)
                        ? (0, permissions_1.normalizePermissions)(permissions_1.FULL_ACCESS)
                        : role.permissions;
                    return [2 /*return*/, __assign(__assign({}, role), { name: (_b = override === null || override === void 0 ? void 0 : override.name) !== null && _b !== void 0 ? _b : role.name, description: (_c = override === null || override === void 0 ? void 0 : override.description) !== null && _c !== void 0 ? _c : role.description, isActive: (_d = override === null || override === void 0 ? void 0 : override.isActive) !== null && _d !== void 0 ? _d : role.isActive, permissions: mergePermissions(corePerms, (override === null || override === void 0 ? void 0 : override.permissions) || []), corePermissions: corePerms })];
            }
        });
    });
}
/**
 * Pure function to build a clean, normalized module->actions dictionary from a role.
 * Automatically sanitizes deprecated actions (e.g. users:delete).
 */
function buildEffectivePermissionMap(role) {
    var _a, _b;
    if (!role || !role.isActive)
        return {};
    var map = {};
    var _loop_1 = function (entry) {
        if (entry.module) {
            var sanitizedActions = ((_b = entry.actions) !== null && _b !== void 0 ? _b : []).filter(function (a) {
                if (entry.module === 'users' && a === 'delete')
                    return false;
                return true;
            });
            map[entry.module] = sanitizedActions;
        }
    };
    for (var _i = 0, _c = (_a = role.permissions) !== null && _a !== void 0 ? _a : []; _i < _c.length; _i++) {
        var entry = _c[_i];
        _loop_1(entry);
    }
    return map;
}
/**
 * Checks whether targetPermissions is a subset of actorPermissions.
 * Used for role-assignment ceiling and custom-role creation/editing checks.
 * Deprecated actions (such as legacy users:delete) are safely ignored.
 */
function isPermissionSubset(targetPerms, actorPerms) {
    for (var _i = 0, _a = Object.entries(targetPerms); _i < _a.length; _i++) {
        var _b = _a[_i], mod = _b[0], actions = _b[1];
        var actorActions = actorPerms[mod] || [];
        for (var _c = 0, actions_1 = actions; _c < actions_1.length; _c++) {
            var act = actions_1[_c];
            if (mod === 'users' && act === 'delete')
                continue;
            if (!actorActions.includes(act)) {
                return false;
            }
        }
    }
    return true;
}
/**
 * Legacy/display helper: returns fresh role permissions dictionary directly from MongoDB.
 */
function getRolePermissionMap(roleId, _roleSlug, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var role;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, effectiveRole(roleId, tenantId, tenantDb)];
                case 1:
                    role = _a.sent();
                    return [2 /*return*/, buildEffectivePermissionMap(role)];
            }
        });
    });
}
/**
 * Authorization helper (kept for any direct consumers).
 * Super admin has explicit bypass. Freshly checks MongoDB.
 */
function hasPermission(roleId, roleSlug, module, action, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var perms;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!tenantId)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, getRolePermissionMap(roleId, roleSlug, tenantId, tenantDb)];
                case 1:
                    perms = _b.sent();
                    return [2 /*return*/, ((_a = perms[module]) !== null && _a !== void 0 ? _a : []).includes(action)];
            }
        });
    });
}
/**
 * Backward compatibility stub: No-op since cache is no longer used for authorization.
 */
function invalidatePermissionCache(_roleId) {
    // Authorization is always fresh from MongoDB
}
