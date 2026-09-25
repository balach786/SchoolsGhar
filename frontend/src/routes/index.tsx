import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { UsersPage } from '@/pages/UsersPage';
import { RolesPage } from '@/pages/RolesPage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { SessionsPage } from '@/pages/SessionsPage';
import { ClassesPage } from '@/pages/ClassesPage';
import { SectionsPage } from '@/pages/SectionsPage';
import { SubjectsPage } from '@/pages/SubjectsPage';
import { StudentsPage } from '@/pages/StudentsPage';
import { StudentProfilePage } from '@/pages/StudentProfilePage';
import { TeachersPage } from '@/pages/TeachersPage';
import { TeacherProfilePage } from '@/pages/TeacherProfilePage';
import { StaffPage } from '@/pages/StaffPage';
import { StaffProfilePage } from '@/pages/StaffProfilePage';
import { PromotionPage } from '@/pages/PromotionPage';
import { StudentAttendancePage } from '@/pages/StudentAttendancePage';
import { TeacherAttendancePage } from '@/pages/TeacherAttendancePage';
import { NonTeachingStaffAttendancePage } from '@/pages/NonTeachingStaffAttendancePage';
import { DailyAttendancePage } from '@/pages/DailyAttendancePage'; // cache bust
import { TimetablePage } from '@/pages/TimetablePage';
import { ExamsPage } from '@/pages/ExamsPage';
import { ExamSchedulePage } from '@/pages/ExamSchedulePage';
import { ExamFeesPage } from '@/pages/ExamFeesPage';
import { AdmitCardsPage } from '@/pages/AdmitCardsPage';
import { SeatingPlanPage } from '@/pages/SeatingPlanPage';
import { ExamAttendancePage } from '@/pages/ExamAttendancePage';
import { ExamReportsPage } from '@/pages/ExamReportsPage';
import { MarksPage } from '@/pages/MarksPage';
import { ResultsPage } from '@/pages/ResultsPage';
import { FeeStructuresPage } from '@/pages/FeeStructuresPage';
import { FeesOverviewPage } from '@/pages/FeesOverviewPage';
import { FeeSetupPage } from '@/pages/FeeSetupPage';
import { FeeSettingsPage } from '@/pages/FeeSettingsPage';
import { CollectFeePage } from '@/pages/CollectFeePage';
import { ClassCollectionPage } from '@/pages/ClassCollectionPage';
import { PendingFeesPage } from '@/pages/PendingFeesPage';
import { FeeHistoryPage } from '@/pages/FeeHistoryPage';
import { ReceiptsPage } from '@/pages/ReceiptsPage';
import { FeeReportsPage } from '@/pages/FeeReportsPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { SalariesPage } from '@/pages/SalariesPage';
import { FinanceHubPage } from '@/pages/FinanceHubPage';
import { AssignmentsPage } from '@/pages/AssignmentsPage';
import { NoticesPage } from '@/pages/NoticesPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { LeavePage } from '@/pages/LeavePage';
import { ReportsPage } from '@/pages/ReportsPage';
import { DataManagementPage } from '@/pages/DataManagementPage';
import { GlobalSearchPage } from '@/pages/GlobalSearchPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { LandingPage } from '@/pages/LandingPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { SubscriptionExpiredPage } from '@/pages/SubscriptionExpiredPage';
import { BillingPage } from '@/pages/BillingPage';
import { PlatformLayout } from '@/pages/platform/PlatformLayout';
import { PlatformLoginPage } from '@/pages/platform/PlatformLoginPage';
import { PlatformDashboardPage } from '@/pages/platform/PlatformDashboardPage';
import { PlatformCustomersPage } from '@/pages/platform/PlatformCustomersPage';
import { PlatformPaymentsPage } from '@/pages/platform/PlatformPaymentsPage';
import { PlatformPlansPage } from '@/pages/platform/PlatformPlansPage';
import { PlatformPaymentMethodsPage } from '@/pages/platform/PlatformPaymentMethodsPage';
import { FinanceReportsPage } from '@/pages/FinanceReportsPage';

/**
 * Route table. Public landing page at `/`.
 * Administration ERP routes inside the layout are protected:
 *  - unauthenticated → /login (with return path)
 *  - missing permission → Access denied
 * Backend enforces the same rules on every API call.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/subscription-expired" element={<SubscriptionExpiredPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route
          path="dashboard"
          element={
            <ProtectedRoute perm={{ module: 'dashboard', action: 'view' }}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="app"
          element={
            <ProtectedRoute perm={{ module: 'dashboard', action: 'view' }}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        {/* Administration */}
        <Route
          path="users"
          element={
            <ProtectedRoute perm={{ module: 'users' }}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="permissions"
          element={
            <ProtectedRoute perm={{ module: 'roles' }}>
              <RolesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit-logs"
          element={
            <ProtectedRoute perm={{ module: 'auditLogs' }}>
              <AuditLogsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="students"
          element={
            <ProtectedRoute perm={{ module: 'students' }}>
              <StudentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="students/new"
          element={
            <ProtectedRoute perm={{ module: 'students', action: 'create' }}>
              <StudentProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="students/:id"
          element={
            <ProtectedRoute perm={{ module: 'students' }}>
              <StudentProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="teachers"
          element={
            <ProtectedRoute perm={{ module: 'teachers' }}>
              <TeachersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="my-profile"
          element={<TeacherProfilePage />}
        />
        <Route
          path="teachers/new"
          element={
            <ProtectedRoute perm={{ module: 'teachers', action: 'create' }}>
              <TeacherProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="teachers/:id"
          element={
            <ProtectedRoute perm={{ module: 'teachers' }}>
              <TeacherProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="staff"
          element={
            <ProtectedRoute perm={{ module: 'users' }}>
              <StaffPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="staff/new"
          element={
            <ProtectedRoute perm={{ module: 'users', action: 'create' }}>
              <StaffProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="staff/:id"
          element={
            <ProtectedRoute perm={{ module: 'users' }}>
              <StaffProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="sessions"
          element={
            <ProtectedRoute perm={{ module: 'academicSessions' }}>
              <SessionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="classes"
          element={
            <ProtectedRoute perm={{ module: 'classes' }}>
              <ClassesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="sections"
          element={
            <ProtectedRoute perm={{ module: 'sections' }}>
              <SectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="subjects"
          element={
            <ProtectedRoute perm={{ module: 'subjects' }}>
              <SubjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="promotions"
          element={
            <ProtectedRoute perm={{ module: 'students', action: 'edit' }} roles={['super_admin', 'admin']}>
              <PromotionPage />
            </ProtectedRoute>
          }
        />

        {/* Attendance & timetable */}
        <Route
          path="daily-attendance"
          element={
            <ProtectedRoute perm={{ module: ['studentAttendance', 'teacherAttendance'] }}>
              <DailyAttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="attendance"
          element={
            <ProtectedRoute perm={{ module: 'studentAttendance' }}>
              <StudentAttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="teacher-attendance"
          element={
            <ProtectedRoute perm={{ module: 'teacherAttendance' }}>
              <TeacherAttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/non-teaching-attendance"
          element={
            <ProtectedRoute perm={{ module: 'nonTeachingAttendance' }}>
              <NonTeachingStaffAttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="timetable"
          element={
            <ProtectedRoute perm={{ module: 'timetables' }}>
              <TimetablePage />
            </ProtectedRoute>
          }
        />
        {/* Exam Management Module */}
        <Route
          path="exams"
          element={
            <ProtectedRoute perm={{ module: 'exams' }}>
              <ExamsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="exams/schedule"
          element={
            <ProtectedRoute perm={{ module: 'exams' }}>
              <ExamSchedulePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="exams/fees"
          element={
            <ProtectedRoute perm={{ module: 'examFees' }}>
              <ExamFeesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="exams/admit-cards"
          element={
            <ProtectedRoute perm={{ module: 'admitCards' }}>
              <AdmitCardsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="exams/seating-plan"
          element={
            <ProtectedRoute perm={{ module: 'admitCards' }}>
              <SeatingPlanPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="exams/attendance"
          element={
            <ProtectedRoute perm={{ module: 'examAttendance' }}>
              <ExamAttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="exams/marks"
          element={
            <ProtectedRoute perm={{ module: 'marks' }}>
              <MarksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="marks"
          element={
            <ProtectedRoute perm={{ module: 'marks' }}>
              <MarksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="exams/results"
          element={
            <ProtectedRoute perm={{ module: 'results' }}>
              <ResultsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="results"
          element={
            <ProtectedRoute perm={{ module: 'results' }}>
              <ResultsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="exams/reports"
          element={
            <ProtectedRoute perm={{ module: 'reports' }}>
              <ExamReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="assignments"
          element={
            <ProtectedRoute perm={{ module: 'assignments' }}>
              <AssignmentsPage />
            </ProtectedRoute>
          }
        />

        {/* Finance Hub */}
        <Route
          path="finance"
          element={
            <ProtectedRoute perm={{ module: ['fees', 'expenses', 'salaries'] }}>
              <FinanceHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="finance-reports"
          element={
            <ProtectedRoute perm={{ module: 'reports' }}>
              <FinanceReportsPage />
            </ProtectedRoute>
          }
        />

        {/* Fees Management */}
        <Route
          path="fees"
          element={
            <ProtectedRoute perm={{ module: 'fees' }}>
              <FeesOverviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="fees/setup"
          element={
            <ProtectedRoute perm={{ module: 'fees' }}>
              <FeeSetupPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="fees/settings"
          element={
            <ProtectedRoute perm={{ module: 'fees' }}>
              <FeeSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="fees/collect"
          element={
            <ProtectedRoute perm={{ module: 'payments' }}>
              <CollectFeePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="fees/class-collection"
          element={
            <ProtectedRoute perm={{ module: 'fees' }}>
              <ClassCollectionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="fees/pending"
          element={
            <ProtectedRoute perm={{ module: 'fees' }}>
              <PendingFeesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="fees/history"
          element={
            <ProtectedRoute perm={{ module: 'fees' }}>
              <FeeHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="fees/receipts"
          element={
            <ProtectedRoute perm={{ module: 'payments' }}>
              <ReceiptsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="fees/reports"
          element={
            <ProtectedRoute perm={{ module: 'reports' }}>
              <FeeReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="payments"
          element={
            <ProtectedRoute perm={{ module: 'payments' }}>
              <PaymentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="expenses"
          element={
            <ProtectedRoute perm={{ module: 'expenses' }}>
              <ExpensesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="salaries"
          element={
            <ProtectedRoute perm={{ module: 'salaries' }}>
              <SalariesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute perm={{ module: 'reports' }}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="data-management"
          element={
            <ProtectedRoute perm={{ module: 'dataManagement' }}>
              <DataManagementPage />
            </ProtectedRoute>
          }
        />

        {/* Communication */}
        <Route
          path="notices"
          element={
            <ProtectedRoute perm={{ module: 'notices' }}>
              <NoticesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="notifications"
          element={
            <ProtectedRoute perm={{ module: 'notifications' }}>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="leave"
          element={
            <ProtectedRoute perm={{ module: 'leaveRequests' }}>
              <LeavePage />
            </ProtectedRoute>
          }
        />

        {/* System */}
        <Route
          path="search"
          element={
            <ProtectedRoute perm={{ module: 'students' }}>
              <GlobalSearchPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute perm={{ module: 'schoolSettings' }}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="billing"
          element={
            <ProtectedRoute roles={['super_admin', 'admin']}>
              <BillingPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Platform Administrator Control Panel */}
      <Route path="/platform-admin/login" element={<PlatformLoginPage />} />
      <Route path="/platform-admin" element={<PlatformLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PlatformDashboardPage />} />
        <Route path="customers" element={<PlatformCustomersPage />} />
        <Route path="payments" element={<PlatformPaymentsPage />} />
        <Route path="plans" element={<PlatformPlansPage />} />
        <Route path="payment-methods" element={<PlatformPaymentMethodsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
