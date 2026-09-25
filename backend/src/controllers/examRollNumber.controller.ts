import { Response } from 'express';
import { AuthRequest } from '../types';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created } from '../utils/apiResponse';
import { getTenantObjectId, scopeQuery } from '../utils/tenantScope';
import { getTenantModels } from '../services/TenantModelRegistry';

export const generateExamRollNumbers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam, Student, Class, ExamRollNumber } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  const { examId, startExamRollNumber, regenerate } = req.body;

  if (!examId) throw ApiError.badRequest('examId is required');

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId })).lean();
  if (!exam) throw ApiError.notFound('Exam not found');

  const examClassIds = exam.classIds && exam.classIds.length > 0 ? exam.classIds : (exam.classId ? [exam.classId] : []);
  
  const students = await Student.find(scopeQuery(req, {
    sessionId: exam.sessionId,
    classId: { $in: examClassIds },
    isArchived: false
  })).populate('classId', 'name').lean();

  if (students.length === 0) {
    return ok(res, { message: 'No participating students found for this exam.', generated: 0 });
  }

  const session = await mongoose.startSession();
  try {
    let resultPayload: any;
    
    await session.withTransaction(async () => {
      if (regenerate) {
        if (startExamRollNumber === undefined || startExamRollNumber < 1 || !Number.isInteger(startExamRollNumber)) {
          throw ApiError.badRequest('Start Exam Roll Number must be a positive integer for regeneration.');
        }
        await ExamRollNumber.deleteMany(scopeQuery(req, { examId }), { session });
      }

      const existingRolls = await ExamRollNumber.find(scopeQuery(req, { examId })).session(session).lean();
      const existingMap = new Map(existingRolls.map(r => [String(r.studentId), r]));

      if (startExamRollNumber === undefined) {
        if (existingRolls.length === 0) {
          throw ApiError.badRequest('No existing Exam Roll Numbers found. Please provide a start number to begin initial generation.');
        }

        let highestRoll = 0;
        for (const r of existingRolls) {
          if (r.examRollNumber > highestRoll) highestRoll = r.examRollNumber;
        }
        
        let nextRoll = highestRoll + 1;
        const newRolls = [];
        
        students.sort((a, b) => {
          const aRoll = String(a.rollNumber || '');
          const bRoll = String(b.rollNumber || '');
          const rComp = aRoll.localeCompare(bRoll, undefined, { numeric: true });
          if (rComp !== 0) return rComp;
          const aAdm = String(a.admissionNumber || '');
          const bAdm = String(b.admissionNumber || '');
          const aComp = aAdm.localeCompare(bAdm, undefined, { numeric: true });
          if (aComp !== 0) return aComp;
          return String(a._id).localeCompare(String(b._id));
        });

        for (const s of students) {
          if (!existingMap.has(String(s._id))) {
            newRolls.push({
              tenantId,
              examId,
              studentId: s._id,
              classId: s.classId._id || s.classId,
              examRollNumber: nextRoll++,
            });
          }
        }
        
        if (newRolls.length > 0) {
          await ExamRollNumber.insertMany(newRolls, { session });
        }
        
        resultPayload = { 
          message: `${newRolls.length} students did not have Exam Roll Numbers. New numbers assigned starting after the current maximum.`, 
          generated: newRolls.length,
          existing: existingRolls.length
        };
        return;
      }

      if (existingRolls.length > 0) {
        throw ApiError.badRequest(`Exam Roll Numbers have already been generated. (${existingRolls.length} existing).`);
      }

      if (startExamRollNumber < 1 || !Number.isInteger(startExamRollNumber)) {
        throw ApiError.badRequest('Start Exam Roll Number must be a positive integer.');
      }

      const classes = await Class.find(scopeQuery(req, { _id: { $in: examClassIds } })).session(session).lean();
      classes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      const studentsByClass = new Map<string, any[]>();
      for (const c of classes) {
        studentsByClass.set(String(c._id), []);
      }

      for (const s of students) {
        const cid = String(s.classId._id || s.classId);
        if (!studentsByClass.has(cid)) studentsByClass.set(cid, []);
        studentsByClass.get(cid)!.push(s);
      }

      for (const classStudents of studentsByClass.values()) {
        classStudents.sort((a, b) => {
          const aRoll = String(a.rollNumber || '');
          const bRoll = String(b.rollNumber || '');
          const rComp = aRoll.localeCompare(bRoll, undefined, { numeric: true });
          if (rComp !== 0) return rComp;
          const aAdm = String(a.admissionNumber || '');
          const bAdm = String(b.admissionNumber || '');
          const aComp = aAdm.localeCompare(bAdm, undefined, { numeric: true });
          if (aComp !== 0) return aComp;
          return String(a._id).localeCompare(String(b._id));
        });
      }

      const assignedRollNumbers = [];
      let currentRoll = startExamRollNumber;
      let hasMore = true;
      let index = 0;
      
      while (hasMore) {
        hasMore = false;
        for (const c of classes) {
          const classStudents = studentsByClass.get(String(c._id)) || [];
          if (index < classStudents.length) {
            assignedRollNumbers.push({
              tenantId,
              examId,
              studentId: classStudents[index]._id,
              classId: c._id,
              examRollNumber: currentRoll++,
            });
            hasMore = true;
          }
        }
        index++;
      }

      if (assignedRollNumbers.length > 0) {
        await ExamRollNumber.insertMany(assignedRollNumbers, { session });
        await Exam.updateOne(scopeQuery(req, { _id: examId }), { $set: { startExamRollNumber } }, { session });
      }

      resultPayload = {
        message: `${assignedRollNumbers.length} Exam Roll Numbers generated successfully. Range: ${startExamRollNumber} - ${currentRoll - 1}`,
        generated: assignedRollNumbers.length,
        rangeStart: startExamRollNumber,
        rangeEnd: currentRoll - 1
      };
    });

    return ok(res, resultPayload);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Concurrency conflict: Exam Roll Numbers already generated.' });
    }
    throw error;
  } finally {
    session.endSession();
  }
});

export const assignSeatingPlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamRollNumber } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  const { examId, block, originalBlock, studentIds } = req.body;

  if (!examId || !block || !studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    throw ApiError.badRequest('examId, block, and a list of studentIds are required');
  }

  const session = await mongoose.startSession();
  try {
    let assignedCount = 0;
    await session.withTransaction(async () => {
      if (!originalBlock || originalBlock !== block) {
        const blockExists = await ExamRollNumber.exists(scopeQuery(req, { examId, block })).session(session);
        if (blockExists) {
          throw ApiError.badRequest(`A block named "${block}" already exists. Please choose a different name.`, 'DUPLICATE_BLOCK_NAME');
        }
      }

      if (originalBlock) {
        const removedStudents = await ExamRollNumber.find(scopeQuery(req, { 
          examId, 
          block: originalBlock, 
          studentId: { $nin: studentIds } 
        })).session(session);

        for (const r of removedStudents) {
          r.block = undefined;
          r.seatNumber = undefined;
          await r.save({ session });
        }
      }

      // Find current max seat number in the block
      const existingInBlock = await ExamRollNumber.find(scopeQuery(req, { examId, block })).session(session).lean();
      let nextSeat = 1;
      for (const r of existingInBlock) {
        if (r.seatNumber) {
           const sn = Number(r.seatNumber);
           if (!isNaN(sn) && sn >= nextSeat) nextSeat = sn + 1;
        }
      }

      // Only update students who are not already in this block
      const rollsToUpdate = await ExamRollNumber.find(scopeQuery(req, { 
        examId, 
        studentId: { $in: studentIds },
        block: { $ne: block }
      })).session(session);
      
      // Sort by roll number to assign seats sequentially
      rollsToUpdate.sort((a, b) => (a.examRollNumber || 0) - (b.examRollNumber || 0));

      for (const roll of rollsToUpdate) {
        roll.block = block;
        roll.seatNumber = String(nextSeat++);
        await roll.save({ session });
        assignedCount++;
      }
    });

    return ok(res, { message: `Assigned ${assignedCount} students to block ${block}` });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Concurrency conflict: Seating collision detected.' });
    }
    throw error;
  } finally {
    session.endSession();
  }
});

export const getExamRollNumbers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamRollNumber } = getTenantModels(tenantDb);

  const { examId } = req.query;
  if (!examId) throw ApiError.badRequest('examId is required');

  const rolls = await ExamRollNumber.find(scopeQuery(req, { examId })).lean();
  ok(res, rolls);
});

export const getExamBlocks = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamRollNumber } = getTenantModels(tenantDb);

  const { examId } = req.query;
  if (!examId) throw ApiError.badRequest('examId is required');

  const blocks = await ExamRollNumber.distinct('block', scopeQuery(req, { examId, block: { $exists: true, $ne: null } }));
  // Also filter out empty string if any
  ok(res, blocks.filter(b => b && b.trim() !== ''));
});
