import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';
import { getTenantModels } from '../services/TenantModelRegistry';
import { getSchoolDayRange, getSchoolTodayISO, SCHOOL_TIMEZONE } from '../utils/schoolDate';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

export const getDailyOverview = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new Error('TENANT_DB_MISSING');
  const models = getTenantModels(tenantDb);
  const tenantId = getTenantObjectId(req);
  const tMatch = (extra: Record<string, any>) => (tenantId ? { ...extra, tenantId } : extra);

  // 1. Day-by-Day Attendance (last 7 days)
  const last7DaysStart = new Date();
  last7DaysStart.setDate(last7DaysStart.getDate() - 7);
  
  const [studentTrends, teacherTrends, staffTrends] = await Promise.all([
    models.StudentAttendance.aggregate([
      { $match: tMatch({ attendanceDate: { $gte: last7DaysStart } }) },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$attendanceDate', timezone: SCHOOL_TIMEZONE } },
          present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
          total: { $sum: 1 }
      }}
    ]),
    models.TeacherAttendance.aggregate([
      { $match: tMatch({ attendanceDate: { $gte: last7DaysStart } }) },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$attendanceDate', timezone: SCHOOL_TIMEZONE } },
          present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
          total: { $sum: 1 }
      }}
    ]),
    models.NonTeachingStaffAttendance.aggregate([
      { $match: tMatch({ attendanceDate: { $gte: last7DaysStart } }) },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$attendanceDate', timezone: SCHOOL_TIMEZONE } },
          present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
          total: { $sum: 1 }
      }}
    ])
  ]);

  const trendsMap = new Map<string, any>();
  const addTrend = (arr: any[], type: string) => {
    arr.forEach(item => {
      const date = item._id;
      if (!trendsMap.has(date)) {
        trendsMap.set(date, { date, student: { present: 0, total: 0 }, teacher: { present: 0, total: 0 }, staff: { present: 0, total: 0 } });
      }
      trendsMap.get(date)[type] = { present: item.present, total: item.total };
    });
  };
  addTrend(studentTrends, 'student');
  addTrend(teacherTrends, 'teacher');
  addTrend(staffTrends, 'staff');
  
  const dayByDay = Array.from(trendsMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  // 2. Today's Class Attendance Status
  const todayISO = getSchoolTodayISO();
  const { start: todayStart, endExclusive: todayEnd } = getSchoolDayRange(todayISO);

  const classes = await models.Class.find(scopeQuery(req, { isArchived: false })).select('_id name').lean();
  const todayClassAttendance = await models.StudentAttendance.aggregate([
    { $match: tMatch({ attendanceDate: { $gte: todayStart, $lt: todayEnd } }) },
    { $group: { _id: '$classId', count: { $sum: 1 } } }
  ]);
  const markedClassIds = new Set(todayClassAttendance.map(a => String(a._id)));

  let completedClasses = 0;
  let pendingClasses = 0;
  
  const classStatus = classes.map(c => {
    const isCompleted = markedClassIds.has(String(c._id));
    if (isCompleted) completedClasses++; else pendingClasses++;
    return {
      id: String(c._id),
      name: c.name,
      status: isCompleted ? 'Completed' : 'Pending'
    };
  });

  ok(res, {
    dayByDay,
    classStatusSummary: {
      totalClasses: classes.length,
      completedClasses,
      pendingClasses,
      classes: classStatus
    }
  });
});
