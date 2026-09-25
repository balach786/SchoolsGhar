import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  createSessionSchema,
  updateSessionSchema,
  createClassSchema,
  updateClassSchema,
  createSectionSchema,
  updateSectionSchema,
  createSubjectSchema,
  updateSubjectSchema,
  createStudentSchema,
  updateStudentSchema,
  listStudentsQuerySchema,
  createTeacherSchema,
  updateTeacherSchema,
  listTeachersQuerySchema,
  listQuerySchema,
  promotionPreviewQuerySchema,
  promotionSchema,
} from '../validators/academic.validators';
import * as sessionController from '../controllers/session.controller';
import * as classController from '../controllers/class.controller';
import * as sectionController from '../controllers/section.controller';
import * as subjectController from '../controllers/subject.controller';
import * as studentController from '../controllers/student.controller';
import * as teacherController from '../controllers/teacher.controller';
import * as promotionController from '../controllers/promotion.controller';
import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';

const router = Router();
router.use(authenticate, resolveTenant, checkSubscriptionAccess);

// ── Academic sessions ────────────────────────────────────
router.get('/academic-sessions/lookup', sessionController.lookupSessions);
router.get('/academic-sessions/active', requirePermission('academicSessions', 'view'), sessionController.getActiveSession);
router.get('/academic-sessions', requirePermission('academicSessions', 'view'), validate({ query: listQuerySchema }), sessionController.listSessions);
router.post('/academic-sessions', requirePermission('academicSessions', 'create'), validate({ body: createSessionSchema }), sessionController.createSession);
router.patch('/academic-sessions/:id', requirePermission('academicSessions', 'edit'), validate({ body: updateSessionSchema }), sessionController.updateSession);
router.post('/academic-sessions/:id/activate', requirePermission('academicSessions', 'edit'), sessionController.activateSession);
router.post('/academic-sessions/:id/archive', requirePermission('academicSessions', 'edit'), sessionController.archiveSession);
router.post('/academic-sessions/:id/restore', requirePermission('academicSessions', 'edit'), sessionController.archiveSession);
router.delete('/academic-sessions/:id', requirePermission('academicSessions', 'delete'), sessionController.deleteSession);

// ── Classes ──────────────────────────────────────────────
router.get('/classes/lookup', classController.lookupClasses);
router.get('/classes', requirePermission('classes', 'view'), validate({ query: listQuerySchema }), classController.listClasses);
router.post('/classes', requirePermission('classes', 'create'), validate({ body: createClassSchema }), classController.createClass);
router.get('/classes/:id', requirePermission('classes', 'view'), classController.getClass);
router.patch('/classes/:id', requirePermission('classes', 'edit'), validate({ body: updateClassSchema }), classController.updateClass);
router.post('/classes/:id/archive', requirePermission('classes', 'archive'), classController.archiveClass);
router.post('/classes/:id/restore', requirePermission('classes', 'archive'), classController.archiveClass);
router.put('/classes/:id/subjects', requirePermission('classes', 'edit'), classController.assignClassSubjects);

router.post('/classes/:id/class-teacher', requirePermission('classes', 'edit'), classController.assignClassTeacherController);
router.delete('/classes/:id/class-teacher', requirePermission('classes', 'edit'), classController.unassignClassTeacherController);

router.post('/classes/:id/substitutes', requirePermission('classes', 'edit'), classController.assignSubstitute);
router.patch('/classes/substitutes/:id/cancel', requirePermission('classes', 'edit'), classController.cancelSubstitute);
router.get('/classes/:id/substitutes', requirePermission('classes', 'view'), classController.listSubstitutes);

// ── Sections ─────────────────────────────────────────────
router.get('/sections/lookup', sectionController.lookupSections);
router.get('/sections', requirePermission('sections', 'view'), validate({ query: listQuerySchema }), sectionController.listSections);
router.post('/sections', requirePermission('sections', 'create'), validate({ body: createSectionSchema }), sectionController.createSection);
router.patch('/sections/:id', requirePermission('sections', 'edit'), validate({ body: updateSectionSchema }), sectionController.updateSection);
router.post('/sections/:id/archive', requirePermission('sections', 'archive'), sectionController.archiveSection);
router.post('/sections/:id/restore', requirePermission('sections', 'archive'), sectionController.archiveSection);
router.get('/sections/:id/students', requirePermission('sections', 'view'), sectionController.sectionStudents);

// ── Subjects ─────────────────────────────────────────────
router.get('/subjects', requirePermission('subjects', 'view'), validate({ query: listQuerySchema }), subjectController.listSubjects);
router.post('/subjects', requirePermission('subjects', 'create'), validate({ body: createSubjectSchema }), subjectController.createSubject);
router.get('/subjects/:id', requirePermission('subjects', 'view'), subjectController.getSubject);
router.patch('/subjects/:id', requirePermission('subjects', 'edit'), validate({ body: updateSubjectSchema }), subjectController.updateSubject);
router.post('/subjects/:id/archive', requirePermission('subjects', 'archive'), subjectController.archiveSubject);
router.post('/subjects/:id/restore', requirePermission('subjects', 'archive'), subjectController.archiveSubject);

// ── Students ─────────────────────────────────────────────
router.get('/students/me', studentController.getOwnProfile);
router.get('/students', requirePermission('students', 'view'), validate({ query: listStudentsQuerySchema }), studentController.listStudents);
router.get('/students/suggested-admission-number', requirePermission('students', 'create'), studentController.getSuggestedAdmissionNumber);
router.post('/students', requirePermission('students', 'create'), validate({ body: createStudentSchema }), studentController.createStudent);
router.get('/students/:id', requirePermission('students', 'view'), studentController.getStudent);
router.patch('/students/:id', requirePermission('students', 'edit'), validate({ body: updateStudentSchema }), studentController.updateStudent);
router.post('/students/:id/archive', requirePermission('students', 'archive'), studentController.archiveStudent);
router.post('/students/:id/restore', requirePermission('students', 'archive'), studentController.archiveStudent);
router.get('/students/:id/history', requirePermission('students', 'view'), studentController.studentHistory);

// ── Teachers ─────────────────────────────────────────────
router.get('/teachers', requirePermission('teachers', 'view'), validate({ query: listTeachersQuerySchema }), teacherController.listTeachers);
router.post('/teachers', requirePermission('teachers', 'create'), validate({ body: createTeacherSchema }), teacherController.createTeacher);
router.get('/teachers/me', teacherController.getOwnProfile);
router.get('/teachers/:id', requirePermission('teachers', 'view'), teacherController.getTeacher);
router.patch('/teachers/:id', requirePermission('teachers', 'edit'), validate({ body: updateTeacherSchema }), teacherController.updateTeacher);
router.post('/teachers/:id/archive', requirePermission('teachers', 'archive'), teacherController.archiveTeacher);
router.post('/teachers/:id/restore', requirePermission('teachers', 'archive'), teacherController.archiveTeacher);

// ── Promotions ──
router.get('/promotions/preview', requirePermission('students', 'edit'), validate({ query: promotionPreviewQuerySchema }), promotionController.previewPromotion);
router.post('/promotions', requirePermission('students', 'edit'), validate({ body: promotionSchema }), promotionController.promoteStudents);

export default router;
