"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMasterConnection = getMasterConnection;
var mongoose_1 = __importDefault(require("mongoose"));
/**
 * Returns the explicit Master DB connection for Phase 3 platform data.
 * The primary mongoose connection established in db.ts is used.
 */
function getMasterConnection() {
    return mongoose_1.default.connection.useDb('schoolsghar_master', { useCache: true });
}
