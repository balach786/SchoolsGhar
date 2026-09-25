import mongoose from 'mongoose';
import { ExamRollNumber } from '../models/ExamRollNumber';

export async function up() {
  console.log('Migrating ExamRollNumber Indexes...');
  
  // A. tenantId + examId + studentId UNIQUE
  // B. tenantId + examId + examRollNumber UNIQUE
  
  await ExamRollNumber.collection.createIndex(
    { tenantId: 1, examId: 1, studentId: 1 },
    { unique: true, name: 'tenant_exam_student_unique' }
  );

  await ExamRollNumber.collection.createIndex(
    { tenantId: 1, examId: 1, examRollNumber: 1 },
    { unique: true, name: 'tenant_exam_roll_unique' }
  );

  console.log('ExamRollNumber Indexes Created Successfully.');
}

export async function down() {
  console.log('Rolling back ExamRollNumber Indexes...');
  try {
    await ExamRollNumber.collection.dropIndex('tenant_exam_student_unique');
    await ExamRollNumber.collection.dropIndex('tenant_exam_roll_unique');
  } catch (err: any) {
    console.warn('Could not drop ExamRollNumber indexes:', err.message);
  }
}
