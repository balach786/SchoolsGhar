"use strict";
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
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.hashToken = hashToken;
exports.refreshTokenTtlMs = refreshTokenTtlMs;
exports.toAuthUser = toAuthUser;
var crypto_1 = __importDefault(require("crypto"));
var bcryptjs_1 = __importDefault(require("bcryptjs"));
var jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
var env_1 = require("../config/env");
var SALT_ROUNDS = 10;
/** Hash a plain password with bcrypt. */
function hashPassword(plain) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, bcryptjs_1.default.hash(plain, SALT_ROUNDS)];
        });
    });
}
/** Compare a plain password against a bcrypt hash. */
function verifyPassword(plain, hash) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, bcryptjs_1.default.compare(plain, hash)];
        });
    });
}
function signAccessToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.jwtAccessSecret, {
        expiresIn: env_1.env.accessTokenExpiresIn,
    });
}
function signRefreshToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.jwtRefreshSecret, {
        expiresIn: env_1.env.refreshTokenExpiresIn,
    });
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, env_1.env.jwtAccessSecret);
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, env_1.env.jwtRefreshSecret);
}
/** SHA-256 hash of a refresh token — only hashes are stored, never tokens. */
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
/** Milliseconds until the refresh token's expiry (for session records). */
function refreshTokenTtlMs(token) {
    var _a;
    var payload = verifyRefreshToken(token);
    var exp = (_a = payload.exp) !== null && _a !== void 0 ? _a : 0;
    return Math.max(0, exp * 1000 - Date.now());
}
function toAuthUser(u) {
    return {
        _id: String(u._id),
        role: u.role,
        roleId: String(u.roleId),
        email: u.email,
        name: u.name,
        tenantId: u.tenantId ? String(u.tenantId) : undefined,
        isPlatformAdmin: Boolean(u.isPlatformAdmin),
    };
}
