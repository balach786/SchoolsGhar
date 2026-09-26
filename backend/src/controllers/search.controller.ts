import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';
import { Student } from '../models/Student';
import { Teacher } from '../models/Teacher';
import { Payment } from '../models/Payment';
import { StudentFee } from '../models/StudentFee';
import { Exam } from '../models/Exam';
import { Notice } from '../models/Notice';
import { Class } from '../models/Class';
import { AuthRequest } from '../types';
import { getOwnStudent, type AuthedUser } from '../services/attendance.service';
import { resolveNoticeScope } from '../services/prompt7.service';
import { hasPermission } from '../services/permission.service';
import { scopeQuery } from '../utils/tenantScope';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';

const RESULT_LIMIT = 5;

/**
 * Global search (Prompt 8) — permission- and ownership-scoped per role, strictly tenant-isolated.
 */
export const globalSearch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user as unknown as AuthedUser;
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    return ok(res, { query: '', sections: [] });
  }
  if (q.length > 80) {
    return ok(res, { query: q.slice(0, 80), sections: [] });
  }
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const sections: { section: string; title: string; items: { label: string; sublabel?: string; path: string }[] }[] = [];
  const tenantDb = (req as AuthRequest).tenantDb as import('mongoose').Connection;
  const can = async (module: string) => hasPermission(user.roleId, user.role, module, 'view', req.user?.tenantId, tenantDb);

  const ownStudent = user.role === 'student' ? await getOwnStudent(user).catch(() => null) : null;

  // ── Students (students.view; students search themselves) ──
  if ((await can('students')) || user.role === 'student') {
    const canStudents = await can('students');
    let filter: Record<string, any> = user.role === 'student'
      ? { _id: ownStudent?._id }
      : { $or: [{ fullName: rx }, { admissionNumber: rx }, { rollNumber: rx }] };
    if (user.role === 'student' && !ownStudent) filter._id = null;
    filter = scopeQuery(req, filter);
    const students = await Student.find(filter)
      .select('fullName admissionNumber rollNumber classId')
      .limit(RESULT_LIMIT)
      .lean();
    if (students.length > 0) {
      const classIds = [...new Set(students.map((s) => String(s.classId)))];
      const classes = await Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean();
      const classMap = new Map(classes.map((c) => [String(c._id), c.name]));
      sections.push({
        section: 'students',
        title: 'Students',
        items: students.map((s) => ({
          label: s.fullName,
          sublabel: `${s.admissionNumber} · ${classMap.get(String(s.classId)) ?? '—'}`,
          path: canStudents ? `/students/${s._id}` : '/',
        })),
      });
    }
  }

  // ── Teachers (teachers.view) ──
  if (await can('teachers')) {
    const filter = scopeQuery(req, { $or: [{ fullName: rx }, { employeeId: rx }, { fatherName: rx }] });
    const teachers = await Teacher.find(filter)
      .select('fullName employeeId')
      .limit(RESULT_LIMIT)
      .lean();
    if (teachers.length > 0) {
      sections.push({
        section: 'teachers',
        title: 'Teachers',
        items: teachers.map((t) => ({
          label: t.fullName,
          sublabel: t.employeeId,
          path: `/teachers/${t._id}`,
        })),
      });
    }
  }

  // ── Payments & receipts (payments.view; students own-only) ──
  if (await can('payments')) {
    let payFilter: Record<string, any> = { receiptNumber: rx };
    if (user.role === 'student') {
      if (!ownStudent) payFilter.studentId = null;
      else payFilter.studentId = ownStudent._id;
    }
    payFilter = scopeQuery(req, payFilter);
    const payments = await Payment.find(payFilter)
      .select('receiptNumber amount paymentDate')
      .sort({ paymentDate: -1 })
      .limit(RESULT_LIMIT)
      .lean();
    if (payments.length > 0) {
      sections.push({
        section: 'payments',
        title: 'Payments',
        items: payments.map((p) => ({
          label: p.receiptNumber,
          sublabel: `${(p.amount / 100).toFixed(2)} PKR`,
          path: '/payments',
        })),
      });
    }
  }

  // ── Exams (exams.view; students only own class, published) ──
  if (await can('exams')) {
    let examFilter: Record<string, any> = { name: rx };
    if (user.role === 'student') {
      examFilter.isPublished = true;
      if (ownStudent) examFilter.classId = ownStudent.classId;
      else examFilter._id = null;
    }
    examFilter = scopeQuery(req, examFilter);
    const exams = await Exam.find(examFilter).select('name classId examDate').limit(RESULT_LIMIT).lean();
    if (exams.length > 0) {
      sections.push({
        section: 'exams',
        title: 'Exams',
        items: exams.map((e) => ({
          label: e.name,
          sublabel: e.examDate ? new Date(e.examDate).toISOString().slice(0, 10) : undefined,
          path: `/results?examId=${e._id}`,
        })),
      });
    }
  }

  // ── Notices (notices.view; audience-scoped) ──
  if (await can('notices')) {
    const { Notice } = getTenantModels(req.tenantDb as mongoose.Connection);
    const scope = await resolveNoticeScope(user, req.tenantDb as mongoose.Connection);
    const noticeFilter = scopeQuery(req, { ...scope, title: rx });
    const notices = await Notice.find(noticeFilter)
      .select('title audienceType createdAt')
      .sort({ createdAt: -1 })
      .limit(RESULT_LIMIT)
      .lean();
    if (notices.length > 0) {
      sections.push({
        section: 'notices',
        title: 'Notices',
        items: notices.map((n) => ({
          label: n.title,
          sublabel: n.audienceType,
          path: '/notices',
        })),
      });
    }
  }

  ok(res, { query: q, sections });
});
