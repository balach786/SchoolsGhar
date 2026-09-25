const fs = require('fs');

const missingContent = `    }
    const keys = Object.keys(obj).sort();
    const entries = keys.map((k) => \`\${JSON.stringify(k)}:\${deterministicStringify(obj[k])}\`);
    return \`{\${entries.join(',')}}\`;
  }

  const serialized = deterministicStringify(canonicalPayload);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Reconcile Exam and ExamSchedule configurations (Correction 3)
 */
export async function reconcileExamConfigurations(
  exam: IExam,
  tenantId: string | mongoose.Types.ObjectId,
  isPublicationPreflight?: boolean
): Promise<Map<string, IExamSchedule>> {
  const schedules = await ExamSchedule.find({
    tenantId,
    examId: exam._id,
  }).lean();

  const scheduleMap = new Map<string, IExamSchedule>();
  for (const s of schedules) {
    const key = \`\${String(s.classId)}|\${String(s.subjectId)}\`;
    scheduleMap.set(key, s as any);
  }

  // Determine all classes applicable to the exam
  const classIds = (exam.classIds && exam.classIds.length > 0)
    ? exam.classIds
    : [exam.classId];

  for (const cId of classIds) {
    for (const sub of exam.subjects) {
      const key = \`\${String(cId)}|\${String(sub.subjectId)}\`;
      const schedule = scheduleMap.get(key);

      if (!schedule) {
        if (isPublicationPreflight) {
          throw ApiError.badRequest(
            \`Exam schedule missing for class \${cId} and subject \${sub.subjectId}\`,
            'EXAM_CONFIGURATION_MISMATCH'
          );
        }
        continue;
      }

      if (schedule.totalMarks !== sub.maxMarks) {
        throw ApiError.badRequest(
          \`Exam subject max marks (\${sub.maxMarks}) contradicts schedule total marks (\${schedule.totalMarks})\`,
          'EXAM_CONFIGURATION_MISMATCH'
        );
      }

      if (sub.passMarks !== undefined && sub.passMarks !== null) {
        if (schedule.passingMarks !== sub.passMarks) {
          throw ApiError.badRequest(
            \`Exam subject pass marks (\${sub.passMarks}) contradicts schedule passing marks (\${schedule.passingMarks})\`,
            'EXAM_CONFIGURATION_MISMATCH'
          );
        }
      }
    }
  }

  return scheduleMap;
}

/**
 * Canonical Result Calculation Engine (Step 4C.1, Corrections 1-7)
 */
export async function computeCanonicalResults(
  exam: IExam,
  options?: {
    isPublicationPreflight?: boolean;
    studentIds?: string[];
  }
): Promise<{
  results: CalculatedStudentResult[];
  scale: IGradeScale;
  studentMap: Map<string, any>;
  subjectMap: Map<string, any>;
  scheduleMap: Map<string, IExamSchedule>;
}> {
  const tenantId = exam.tenantId;

  // 1. Resolve GradeScale
  const scale = await GradeScale.findOne({ _id: exam.gradeScaleId, tenantId }).lean();
  if (!scale || !scale.boundaries || scale.boundaries.length === 0) {
    throw ApiError.badRequest('The exam references a missing or invalid grade scale', 'GRADE_SCALE_NOT_FOUND');
  }

  // 2. Validate configuration consistency with ExamSchedule (Correction 3)
  const scheduleMap = await reconcileExamConfigurations(exam, tenantId, options?.isPublicationPreflight);

  // 3. Resolve applicable students
  const classIds = (exam.classIds && exam.classIds.length > 0)
    ? exam.classIds
    : [exam.classId];

  const studentQuery: Record<string, any> = {
    tenantId,
    sessionId: exam.sessionId,
    classId: { $in: classIds },
    isArchived: false,
  };`;

// READ orig.ts which has lines 102 to 190 missing
// We must extract from the currently broken file, finding the original import { validateSnapshotConsistency }
const currentContent = fs.readFileSync('backend/src/services/resultCalculation.service.ts', 'utf8');
const lines = currentContent.split('\n');

// Find the LAST occurrence of 'import { validateSnapshotConsistency }' which marks the start of the original file
let lastImportIdx = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].startsWith('import { validateSnapshotConsistency }')) {
    lastImportIdx = i;
    break;
  }
}

if (lastImportIdx === -1) {
  console.log('Could not find original file start');
  process.exit(1);
}

// Slice out the original file contents (this is orig.ts but without writing it to disk)
const origLines = lines.slice(lastImportIdx);
// origLines has length 576
// Find where to insert missingContent
// The missing content goes right before `  if (options?.studentIds && options.studentIds.length > 0) {`
let targetIdx = -1;
for (let i = 0; i < origLines.length; i++) {
  if (origLines[i].includes('if (options?.studentIds && options.studentIds.length > 0) {')) {
    targetIdx = i;
    break;
  }
}

if (targetIdx === -1) {
  console.log('Could not find target idx in origLines');
  process.exit(1);
}

// The line before targetIdx should be `  };` which was the end of studentQuery.
// Wait, the original file had:
//    if (Array.isArray(obj)) {
//      return `[${obj.map((item) => deterministicStringify(item)).join(',')}]`;
//    };
// (multi_replace_file_content left this fragment)

const topHalf = origLines.slice(0, targetIdx - 1).join('\n'); // skip the fragment `  };` and `    };` if they are there
// Let's just slice up to the `    if (Array.isArray(obj)) {` + 2 lines
let returnArrayIdx = -1;
for (let i = 0; i < origLines.length; i++) {
  if (origLines[i].includes('if (Array.isArray(obj)) {')) {
    returnArrayIdx = i;
    break;
  }
}

const safeTopHalf = origLines.slice(0, returnArrayIdx + 2).join('\n');
const safeBottomHalf = origLines.slice(targetIdx).join('\n');

fs.writeFileSync('backend/src/services/resultCalculation.service.ts', safeTopHalf + '\n' + missingContent + '\n\n' + safeBottomHalf);
console.log('Successfully applied final fix!');
