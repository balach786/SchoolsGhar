"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = void 0;
/**
 * Centralized API error with HTTP status + machine code.
 * All business errors flow through this class and are handled
 * by the centralized error middleware — never leak stack traces
 * or sensitive details to clients.
 */
var ApiError = /** @class */ (function (_super) {
    __extends(ApiError, _super);
    function ApiError(statusCode, message, code, details) {
        if (code === void 0) { code = 'ERROR'; }
        var _this = _super.call(this, message) || this;
        _this.name = 'ApiError';
        _this.statusCode = statusCode;
        _this.code = code;
        _this.details = details;
        Error.captureStackTrace(_this, _this.constructor);
        return _this;
    }
    ApiError.badRequest = function (message, code, details) {
        if (code === void 0) { code = 'BAD_REQUEST'; }
        return new ApiError(400, message, code, details);
    };
    ApiError.unauthorized = function (message, code) {
        if (message === void 0) { message = 'Authentication required'; }
        if (code === void 0) { code = 'UNAUTHORIZED'; }
        return new ApiError(401, message, code);
    };
    ApiError.forbidden = function (message, code) {
        if (message === void 0) { message = 'You do not have permission to perform this action'; }
        if (code === void 0) { code = 'FORBIDDEN'; }
        return new ApiError(403, message, code);
    };
    ApiError.notFound = function (message, code) {
        if (message === void 0) { message = 'Resource not found'; }
        if (code === void 0) { code = 'NOT_FOUND'; }
        return new ApiError(404, message, code);
    };
    ApiError.conflict = function (message, code, details) {
        if (code === void 0) { code = 'CONFLICT'; }
        return new ApiError(409, message, code, details);
    };
    ApiError.unprocessable = function (message, code, details) {
        if (code === void 0) { code = 'UNPROCESSABLE'; }
        return new ApiError(422, message, code, details);
    };
    ApiError.tooManyRequests = function (message) {
        if (message === void 0) { message = 'Too many requests, please slow down'; }
        return new ApiError(429, message, 'RATE_LIMITED');
    };
    return ApiError;
}(Error));
exports.ApiError = ApiError;
