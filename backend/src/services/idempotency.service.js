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
exports.hashPayload = hashPayload;
exports.acquireIdempotency = acquireIdempotency;
exports.releaseIdempotency = releaseIdempotency;
exports.completeIdempotency = completeIdempotency;
var mongoose_1 = __importDefault(require("mongoose"));
var crypto_1 = __importDefault(require("crypto"));
var ApiError_1 = require("../utils/ApiError");
var FinancialIdempotency_1 = require("../models/FinancialIdempotency");
/**
 * Deterministic hash of canonical business payload for idempotency.
 * Excludes timestamp / noise keys.
 */
function hashPayload(payload) {
    var clean = {};
    var sortedKeys = Object.keys(payload).sort();
    for (var _i = 0, sortedKeys_1 = sortedKeys; _i < sortedKeys_1.length; _i++) {
        var k = sortedKeys_1[_i];
        if (['timestamp', 'createdAt', 'clientTimestamp', 'requestId'].includes(k))
            continue;
        clean[k] = payload[k];
    }
    return crypto_1.default.createHash('sha256').update(JSON.stringify(clean)).digest('hex');
}
/**
 * Start heartbeat for active idempotency lock to prevent false stale reclaim while request is alive.
 */
function createHeartbeat(recordKey, ownerToken) {
    var _this = this;
    var timer = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, FinancialIdempotency_1.FinancialIdempotency.updateOne({ _id: recordKey, ownerToken: ownerToken, status: 'in_progress' }, { $set: { heartbeatAt: new Date() } })];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); }, 3000);
    if (timer.unref)
        timer.unref();
    return function () {
        clearInterval(timer);
    };
}
/**
 * Acquire idempotency lock or return cached response.
 * Throws 409 if in progress or if key reused with different payload.
 */
function acquireIdempotency(tenantId_1, operation_1, idempotencyKey_1, payload_1, session_1) {
    return __awaiter(this, arguments, void 0, function (tenantId, operation, idempotencyKey, payload, session, retentionDays, staleTimeoutMs) {
        var cleanKey, tId, recordKey, requestHash, ownerToken, existing, lastActive, inactiveMs, reclaimed, stopHeartbeat_1, expiresAt, lockDoc, err_1, stopHeartbeat;
        var _a;
        if (retentionDays === void 0) { retentionDays = 7; }
        if (staleTimeoutMs === void 0) { staleTimeoutMs = 30000; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!idempotencyKey || !idempotencyKey.trim()) {
                        return [2 /*return*/, { isCached: false }];
                    }
                    cleanKey = idempotencyKey.trim();
                    tId = new mongoose_1.default.Types.ObjectId(String(tenantId));
                    recordKey = "".concat(tId, ":").concat(operation, ":").concat(cleanKey);
                    requestHash = hashPayload(payload);
                    ownerToken = crypto_1.default.randomUUID();
                    return [4 /*yield*/, FinancialIdempotency_1.FinancialIdempotency.findById(recordKey).session(session || null)];
                case 1:
                    existing = _b.sent();
                    if (!existing) return [3 /*break*/, 4];
                    if (existing.status === 'completed') {
                        if (existing.requestHash !== requestHash) {
                            throw ApiError_1.ApiError.conflict('Idempotency key has already been used with a different request payload', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
                        }
                        return [2 /*return*/, {
                                isCached: true,
                                cachedResponse: {
                                    status: existing.responseStatus || 200,
                                    body: existing.responseBody || {},
                                },
                            }];
                    }
                    if (!(existing.status === 'in_progress')) return [3 /*break*/, 4];
                    lastActive = existing.heartbeatAt || existing.createdAt;
                    inactiveMs = Date.now() - new Date(lastActive).getTime();
                    if (!(inactiveMs > staleTimeoutMs && existing.requestHash === requestHash)) return [3 /*break*/, 3];
                    return [4 /*yield*/, FinancialIdempotency_1.FinancialIdempotency.findOneAndUpdate({ _id: recordKey, status: 'in_progress', ownerToken: existing.ownerToken }, {
                            $set: {
                                ownerToken: ownerToken,
                                heartbeatAt: new Date(),
                                requestHash: requestHash,
                            },
                        }, { new: true })];
                case 2:
                    reclaimed = _b.sent();
                    if (reclaimed) {
                        stopHeartbeat_1 = createHeartbeat(recordKey, ownerToken);
                        return [2 /*return*/, { isCached: false, recordKey: recordKey, ownerToken: ownerToken, stopHeartbeat: stopHeartbeat_1 }];
                    }
                    _b.label = 3;
                case 3: throw ApiError_1.ApiError.conflict('A request with this idempotency key is currently in progress. Please retry shortly.', 'REQUEST_IN_PROGRESS');
                case 4:
                    expiresAt = new Date(Date.now() + retentionDays * 24 * 3600 * 1000);
                    lockDoc = new FinancialIdempotency_1.FinancialIdempotency({
                        _id: recordKey,
                        tenantId: tId,
                        operation: operation,
                        idempotencyKey: cleanKey,
                        requestHash: requestHash,
                        ownerToken: ownerToken,
                        heartbeatAt: new Date(),
                        status: 'in_progress',
                        expiresAt: expiresAt,
                    });
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, lockDoc.save({ session: session })];
                case 6:
                    _b.sent();
                    return [3 /*break*/, 8];
                case 7:
                    err_1 = _b.sent();
                    if (err_1.code === 11000 || ((_a = err_1.message) === null || _a === void 0 ? void 0 : _a.includes('E11000'))) {
                        throw ApiError_1.ApiError.conflict('A request with this idempotency key is currently in progress or was just committed.', 'REQUEST_IN_PROGRESS');
                    }
                    throw err_1;
                case 8:
                    stopHeartbeat = createHeartbeat(recordKey, ownerToken);
                    return [2 /*return*/, { isCached: false, recordKey: recordKey, ownerToken: ownerToken, stopHeartbeat: stopHeartbeat }];
            }
        });
    });
}
/**
 * Release/clear in-progress idempotency lock on operation failure.
 * Does not remove completed idempotency records.
 * Protects lock ownership: Request A cannot accidentally delete Request B's lock.
 */
function releaseIdempotency(recordKey, ownerToken) {
    return __awaiter(this, void 0, void 0, function () {
        var filter, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!recordKey)
                        return [2 /*return*/];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    filter = { _id: recordKey, status: 'in_progress' };
                    if (ownerToken)
                        filter.ownerToken = ownerToken;
                    return [4 /*yield*/, FinancialIdempotency_1.FinancialIdempotency.deleteOne(filter)];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Commit completed idempotency outcome inside the SAME MongoDB ClientSession transaction.
 * Ensures atomicity: financial mutations and idempotency completion commit together.
 */
function completeIdempotency(recordKey, resultRef, responseStatus, responseBody, session, ownerToken) {
    return __awaiter(this, void 0, void 0, function () {
        var filter, result, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!recordKey)
                        return [2 /*return*/];
                    filter = { _id: recordKey, status: 'in_progress' };
                    if (ownerToken)
                        filter.ownerToken = ownerToken;
                    return [4 /*yield*/, FinancialIdempotency_1.FinancialIdempotency.updateOne(filter, {
                            $set: {
                                status: 'completed',
                                resultRef: resultRef,
                                responseStatus: responseStatus,
                                responseBody: responseBody,
                            },
                        }, { session: session })];
                case 1:
                    result = _a.sent();
                    if (!(result.matchedCount === 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, FinancialIdempotency_1.FinancialIdempotency.findById(recordKey).session(session || null)];
                case 2:
                    existing = _a.sent();
                    if ((existing === null || existing === void 0 ? void 0 : existing.status) === 'completed') {
                        return [2 /*return*/];
                    }
                    throw ApiError_1.ApiError.conflict('Idempotency lock ownership lost or expired', 'IDEMPOTENCY_LOCK_LOST');
                case 3: return [2 /*return*/];
            }
        });
    });
}
