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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAY_NAMES = exports.Timetable = void 0;
exports.publicTimetable = publicTimetable;
exports.toMinutes = toMinutes;
exports.overlaps = overlaps;
var mongoose_1 = __importStar(require("mongoose"));
var timetableSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Section', default: null },
    dayOfWeek: { type: Number, required: true, min: 1, max: 6 },
    periodNumber: { type: Number, required: true, min: 1, max: 20 },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    subjectId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subject' },
    teacherId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Teacher' },
    isBreak: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false, index: true },
}, { timestamps: true, versionKey: false });
timetableSchema.index({ tenantId: 1, classId: 1, sectionId: 1, dayOfWeek: 1 });
timetableSchema.index({ tenantId: 1, teacherId: 1, dayOfWeek: 1 });
exports.Timetable = mongoose_1.default.models.Timetable || mongoose_1.default.model('Timetable', timetableSchema);
function publicTimetable(t) {
    var _a;
    return {
        _id: String(t._id),
        sessionId: String(t.sessionId),
        classId: String(t.classId),
        sectionId: t.sectionId ? String(t.sectionId) : null,
        dayOfWeek: t.dayOfWeek,
        periodNumber: t.periodNumber,
        startTime: t.startTime,
        endTime: t.endTime,
        subjectId: t.subjectId ? String(t.subjectId) : null,
        teacherId: t.teacherId ? String(t.teacherId) : null,
        isBreak: t.isBreak,
        isArchived: (_a = t.isArchived) !== null && _a !== void 0 ? _a : false,
    };
}
exports.DAY_NAMES = {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
};
/** Parse "HH:mm" → minutes since midnight. */
function toMinutes(t) {
    var _a = t.split(':').map(Number), h = _a[0], m = _a[1];
    return h * 60 + m;
}
/** True when [s1,e1) overlaps [s2,e2). */
function overlaps(s1, e1, s2, e2) {
    return toMinutes(s1) < toMinutes(e2) && toMinutes(s2) < toMinutes(e1);
}
