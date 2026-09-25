import mongoose, { ClientSession, Connection } from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { getTenantModels } from './TenantModelRegistry';

export async function assignClassTeacher(
  tenantId: mongoose.Types.ObjectId,
  classId: mongoose.Types.ObjectId,
  teacherId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  session: ClientSession,
  tenantDb: Connection
) {
  const { Class, Staff, ClassTeacherAssignment } = getTenantModels(tenantDb);

  // Validate Class exists and doesn't already have a teacher
  const cls = await Class.findOne({ _id: classId, tenantId }).session(session);
  if (!cls) throw ApiError.notFound('Class not found');
  if (cls.classTeacherId) {
    if (String(cls.classTeacherId) === String(teacherId)) {
      return; // Already assigned to this teacher
    }
    throw ApiError.conflict('This class already has a Class Teacher assigned');
  }

  // Validate Teacher exists in this tenant and is teaching staff
  const teacher = await Staff.findOne({ _id: teacherId, tenantId, staffType: 'teaching' }).session(session);
  if (!teacher) throw ApiError.badRequest('Selected teacher not found or is not teaching staff');

  // One-class-per-teacher invariant: teacher must not already be class teacher of another class
  const existingAssignment = await ClassTeacherAssignment.findOne({
    tenantId,
    teacherId,
    status: 'active'
  }).session(session);
  
  if (existingAssignment) {
    throw ApiError.conflict('This teacher is already the Class Teacher of another class. Please unassign them first.');
  }

  // Update Class.classTeacherId
  cls.classTeacherId = teacherId;
  await cls.save({ session });

  // Create Assignment History record
  await ClassTeacherAssignment.create([{
    tenantId,
    classId,
    teacherId,
    startDate: new Date(),
    status: 'active',
    assignedBy: userId,
  }], { session });
}

export async function unassignClassTeacher(
  tenantId: mongoose.Types.ObjectId,
  classId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  session: ClientSession,
  tenantDb: Connection
) {
  const { Class, ClassTeacherAssignment } = getTenantModels(tenantDb);

  const cls = await Class.findOne({ _id: classId, tenantId }).session(session);
  if (!cls) throw ApiError.notFound('Class not found');
  if (!cls.classTeacherId) return;

  const currentTeacherId = cls.classTeacherId;

  // Clear Class.classTeacherId
  cls.classTeacherId = undefined;
  await cls.save({ session });

  // End the active assignment history record
  const activeAssignment = await ClassTeacherAssignment.findOne({
    tenantId,
    classId,
    teacherId: currentTeacherId,
    status: 'active'
  }).session(session);

  if (activeAssignment) {
    activeAssignment.status = 'ended';
    activeAssignment.endDate = new Date();
    (activeAssignment as any).endedBy = userId;
    await activeAssignment.save({ session });
  }
}

export async function changeClassTeacher(
  tenantId: mongoose.Types.ObjectId,
  classId: mongoose.Types.ObjectId,
  newTeacherId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  session: ClientSession,
  tenantDb: Connection
) {
  await unassignClassTeacher(tenantId, classId, userId, session, tenantDb);
  await assignClassTeacher(tenantId, classId, newTeacherId, userId, session, tenantDb);
}
