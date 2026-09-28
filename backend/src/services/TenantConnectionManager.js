"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantConnection = getTenantConnection;
var mongoose_1 = __importDefault(require("mongoose"));
var ApiError_1 = require("../utils/ApiError");
/**
 * Manages dynamically switching between tenant databases
 * using the primary Mongoose Atlas connection pool.
 */
function getTenantConnection(databaseName) {
    if (!databaseName || typeof databaseName !== 'string' || databaseName.trim() === '') {
        throw new ApiError_1.ApiError(500, 'Invalid database name requested for tenant connection', 'INTERNAL_ERROR');
    }
    // useDb caches connections automatically when useCache: true is set
    // This reuses the primary Mongoose Atlas pool established in config/db.ts
    return mongoose_1.default.connection.useDb(databaseName, { useCache: true });
}
