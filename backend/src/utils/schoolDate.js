"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHOOL_TIMEZONE = void 0;
exports.schoolLocalToUtc = schoolLocalToUtc;
exports.getSchoolTodayISO = getSchoolTodayISO;
exports.getSchoolCurrentMonthISO = getSchoolCurrentMonthISO;
exports.getSchoolDayRange = getSchoolDayRange;
exports.getSchoolMonthRange = getSchoolMonthRange;
exports.getSchoolCustomRange = getSchoolCustomRange;
var ApiError_1 = require("./ApiError");
exports.SCHOOL_TIMEZONE = process.env.SCHOOL_TIMEZONE || 'Asia/Karachi';
/**
 * Convert local date components in SCHOOL_TIMEZONE to the exact UTC Date instant.
 */
function schoolLocalToUtc(year, month, day, hour, minute, second) {
    if (hour === void 0) { hour = 0; }
    if (minute === void 0) { minute = 0; }
    if (second === void 0) { second = 0; }
    var guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
    try {
        var formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: exports.SCHOOL_TIMEZONE,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false,
        });
        var parts = Object.fromEntries(formatter.formatToParts(guess).map(function (p) { return [p.type, parseInt(p.value, 10)]; }));
        if (parts.hour === 24)
            parts.hour = 0;
        var localAsUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0));
        var diff = guess.getTime() - localAsUtc.getTime();
        return new Date(guess.getTime() + diff);
    }
    catch (_a) {
        return guess;
    }
}
/**
 * Get current calendar date string (YYYY-MM-DD) in the school's local timezone.
 */
function getSchoolTodayISO() {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: exports.SCHOOL_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date());
    }
    catch (_a) {
        return new Date().toISOString().slice(0, 10);
    }
}
/**
 * Get current calendar month string (YYYY-MM) in the school's local timezone.
 */
function getSchoolCurrentMonthISO() {
    return getSchoolTodayISO().slice(0, 7);
}
/**
 * Construct half-open boundary [startUtc, endExclusiveUtc] for a single school-local calendar day (YYYY-MM-DD).
 */
function getSchoolDayRange(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw ApiError_1.ApiError.badRequest('Invalid date format (expected YYYY-MM-DD)', 'INVALID_DATE');
    }
    var _a = dateStr.split('-').map(Number), y = _a[0], m = _a[1], d = _a[2];
    var start = schoolLocalToUtc(y, m, d, 0, 0, 0);
    var nextDate = new Date(Date.UTC(y, m - 1, d + 1));
    var endExclusive = schoolLocalToUtc(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, nextDate.getUTCDate(), 0, 0, 0);
    return { start: start, endExclusive: endExclusive };
}
/**
 * Construct half-open boundary [startUtc, endExclusiveUtc] for a school-local month (YYYY-MM).
 * E.g. '2026-09' in Asia/Karachi (UTC+05:00) -> start: 2026-08-31T19:00:00.000Z, endExclusive: 2026-09-30T19:00:00.000Z.
 * Never calculates September using 'September 31' or rolls over unintentionally.
 */
function getSchoolMonthRange(monthStr) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) {
        throw ApiError_1.ApiError.badRequest('Invalid month format (expected YYYY-MM)', 'INVALID_MONTH');
    }
    var _a = monthStr.split('-').map(Number), y = _a[0], m = _a[1];
    var start = schoolLocalToUtc(y, m, 1, 0, 0, 0);
    var nextYear = m === 12 ? y + 1 : y;
    var nextMonth = m === 12 ? 1 : m + 1;
    var endExclusive = schoolLocalToUtc(nextYear, nextMonth, 1, 0, 0, 0);
    return { start: start, endExclusive: endExclusive };
}
/**
 * Construct half-open boundary for custom range [from YYYY-MM-DD, to YYYY-MM-DD inclusive].
 * If 'to' is provided, endExclusive is set to the start of the following school-local day.
 */
function getSchoolCustomRange(fromStr, toStr) {
    var start;
    var endExclusive;
    if (fromStr) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
            throw ApiError_1.ApiError.badRequest('Invalid from date format (expected YYYY-MM-DD)', 'INVALID_FROM_DATE');
        }
        var _a = fromStr.split('-').map(Number), y = _a[0], m = _a[1], d = _a[2];
        start = schoolLocalToUtc(y, m, d, 0, 0, 0);
    }
    if (toStr) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
            throw ApiError_1.ApiError.badRequest('Invalid to date format (expected YYYY-MM-DD)', 'INVALID_TO_DATE');
        }
        var _b = toStr.split('-').map(Number), y = _b[0], m = _b[1], d = _b[2];
        var nextDate = new Date(Date.UTC(y, m - 1, d + 1));
        endExclusive = schoolLocalToUtc(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, nextDate.getUTCDate(), 0, 0, 0);
    }
    return { start: start, endExclusive: endExclusive };
}
