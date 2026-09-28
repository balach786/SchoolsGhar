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
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.requestContext = void 0;
var async_hooks_1 = require("async_hooks");
exports.requestContext = new async_hooks_1.AsyncLocalStorage();
// Sensitive keys to sanitize from log metadata
var REDACTED_KEYS = new Set([
    'password',
    'passwordhash',
    'currentpassword',
    'newpassword',
    'token',
    'accesstoken',
    'refreshtoken',
    'tokenhash',
    'authorization',
    'jwtaccesssecret',
    'jwtrefreshsecret',
    'backupencryptionkey',
    'secret',
    'key',
]);
function sanitizeMeta(meta) {
    if (!meta || typeof meta !== 'object')
        return meta;
    if (meta instanceof Error) {
        return {
            message: meta.message,
            name: meta.name,
            stack: process.env.NODE_ENV === 'production' ? undefined : meta.stack,
        };
    }
    if (Array.isArray(meta)) {
        return meta.map(sanitizeMeta);
    }
    var clean = {};
    for (var _i = 0, _a = Object.entries(meta); _i < _a.length; _i++) {
        var _b = _a[_i], k = _b[0], v = _b[1];
        if (REDACTED_KEYS.has(k.toLowerCase())) {
            clean[k] = '[REDACTED]';
        }
        else if (typeof v === 'object' && v !== null) {
            clean[k] = sanitizeMeta(v);
        }
        else {
            clean[k] = v;
        }
    }
    return clean;
}
function log(level, message, meta) {
    var ctx = exports.requestContext.getStore();
    var isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
        var payload = __assign({ timestamp: new Date().toISOString(), level: level.toUpperCase(), message: message }, (ctx ? ctx : {}));
        if (meta !== undefined) {
            payload.meta = sanitizeMeta(meta);
        }
        var out = JSON.stringify(payload);
        if (level === 'error')
            console.error(out);
        else if (level === 'warn')
            console.warn(out);
        else
            console.log(out);
    }
    else {
        // Development human-readable formatting
        var prefix = (ctx === null || ctx === void 0 ? void 0 : ctx.requestId) ? "[".concat(ctx.requestId, "] ") : '';
        var line = "[".concat(new Date().toISOString(), "] [").concat(level.toUpperCase(), "] ").concat(prefix).concat(message);
        var cleanMeta = meta !== undefined ? sanitizeMeta(meta) : '';
        if (level === 'error')
            console.error(line, cleanMeta);
        else if (level === 'warn')
            console.warn(line, cleanMeta);
        else
            console.log(line, cleanMeta);
    }
}
exports.logger = {
    info: function (m, meta) { return log('info', m, meta); },
    warn: function (m, meta) { return log('warn', m, meta); },
    error: function (m, meta) { return log('error', m, meta); },
    debug: function (m, meta) {
        if (process.env.NODE_ENV === 'development')
            log('debug', m, meta);
    },
};
