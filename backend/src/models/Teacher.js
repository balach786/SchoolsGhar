"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Teacher = exports.teacherDiscriminatorSchema = void 0;
exports.publicTeacher = publicTeacher;
var mongoose_1 = require("mongoose");
var Staff_1 = require("./Staff");
/**
 * Teaching-specific discriminator schema.
 * Bound to the physical 'staff' collection with mandatory staffType: 'teaching' discriminator key.
 */
exports.teacherDiscriminatorSchema = new mongoose_1.Schema({}, { _id: false, versionKey: false });
// Defense-in-depth: Ensure every query on Teacher enforces staffType = 'teaching'
exports.teacherDiscriminatorSchema.pre(/^find/, function (next) {
    this.where({ staffType: 'teaching' });
    next();
});
exports.teacherDiscriminatorSchema.pre('countDocuments', function (next) {
    this.where({ staffType: 'teaching' });
    next();
});
exports.teacherDiscriminatorSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
    this.where({ staffType: 'teaching' });
    next();
});
/**
 * Teacher compatibility model.
 * Physically queries 'staff' collection, but strictly filters staffType: 'teaching'.
 * Non-teaching Staff documents are NEVER returned or resolved by Teacher.
 */
exports.Teacher = (Staff_1.Staff.discriminators && Staff_1.Staff.discriminators['Teacher']) ||
    Staff_1.Staff.discriminator('Teacher', exports.teacherDiscriminatorSchema, 'teaching');
/**
 * Preserves the exact publicTeacher serializer contract for backward compatibility.
 */
function publicTeacher(t, opts) {
    return (0, Staff_1.publicStaff)(t, opts);
}
