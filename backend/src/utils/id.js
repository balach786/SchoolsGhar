"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomToken = randomToken;
exports.randomDigits = randomDigits;
exports.generateReceiptNumber = generateReceiptNumber;
exports.generateAdmissionNumber = generateAdmissionNumber;
var crypto_1 = __importDefault(require("crypto"));
/** Cryptographically secure random token (e.g. refresh session ids). */
function randomToken(bytes) {
    if (bytes === void 0) { bytes = 32; }
    return crypto_1.default.randomBytes(bytes).toString('hex');
}
/** Short readable id suffix, e.g. for receipt numbers. */
function randomDigits(length) {
    if (length === void 0) { length = 4; }
    var n = crypto_1.default.randomInt(0, Math.pow(10, length));
    return n.toString().padStart(length, '0');
}
/**
 * Build a unique receipt number like RCP-20260904-7F3A21.
 * Uniqueness is still enforced at the DB level (unique index).
 */
function generateReceiptNumber(prefix) {
    if (prefix === void 0) { prefix = 'RCP'; }
    var d = new Date();
    var ymd = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
    ].join('');
    var rand = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
    return "".concat(prefix, "-").concat(ymd, "-").concat(rand);
}
/** Generate admission numbers like ADM-2026-0042. Default to 4 digits padding matching school convention. */
function generateAdmissionNumber(year, seq, minPadding) {
    if (minPadding === void 0) { minPadding = 4; }
    return "ADM-".concat(year, "-").concat(String(seq).padStart(minPadding, '0'));
}
