import mongoose, { Schema, Model } from 'mongoose';
import { Staff, IStaff, publicStaff } from './Staff';

/**
 * Backward compatibility interface for Teacher.
 * Extends unified IStaff with guaranteed staffType = 'teaching'.
 */
export interface ITeacher extends IStaff {
  staffType: 'teaching';

}

/**
 * Teaching-specific discriminator schema.
 * Bound to the physical 'staff' collection with mandatory staffType: 'teaching' discriminator key.
 */
export const teacherDiscriminatorSchema = new Schema(
  {},
  { _id: false, versionKey: false }
);

// Defense-in-depth: Ensure every query on Teacher enforces staffType = 'teaching'
teacherDiscriminatorSchema.pre(/^find/, function (this: any, next) {
  this.where({ staffType: 'teaching' });
  next();
});

teacherDiscriminatorSchema.pre('countDocuments', function (this: any, next) {
  this.where({ staffType: 'teaching' });
  next();
});

teacherDiscriminatorSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'] as any, function (this: any, next: any) {
  this.where({ staffType: 'teaching' });
  next();
});

/**
 * Teacher compatibility model.
 * Physically queries 'staff' collection, but strictly filters staffType: 'teaching'.
 * Non-teaching Staff documents are NEVER returned or resolved by Teacher.
 */
export const Teacher: Model<ITeacher> =
  (Staff.discriminators && (Staff.discriminators['Teacher'] as Model<ITeacher>)) ||
  Staff.discriminator<ITeacher>('Teacher', teacherDiscriminatorSchema, 'teaching');

/**
 * Preserves the exact publicTeacher serializer contract for backward compatibility.
 */
export function publicTeacher(
  t: ITeacher | (Record<string, any> & { _id?: unknown }),
  opts?: { hideSalary?: boolean }
) {
  return publicStaff(t as any, opts);
}
