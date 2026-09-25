import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  UserCheck,
  GraduationCap,
  Users,
  Wallet,
  Building,
  Check,
  Minus,
  Sparkles,
  Lock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function RolesPermissionsSection() {
  const [activeRole, setActiveRole] = useState<'super_admin' | 'principal' | 'teacher' | 'student' | 'accountant' | 'receptionist'>('super_admin');

  const roles = [
    {
      id: 'super_admin',
      title: 'Super Admin',
      icon: ShieldCheck,
      description: 'Total administrative autonomy across school instances',
      modules: ['Full System Configuration', 'User Provisioning & Roles', 'Permission Matrices', 'Audit Logs & Database Access', 'Comprehensive Multi-branch Analytics'],
      accessLevel: 'Global Root Access',
      badgeColor: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10',
    },
    {
      id: 'principal',
      title: 'Principal / School Admin',
      icon: UserCheck,
      description: 'Academic governance, faculty performance, and student progression',
      modules: ['Faculty Assignments & Workload', 'Academic Calendar & Timetables', 'Examinations & Result Approvals', 'Institution Health Reports', 'Staff Leave Sanctioning'],
      accessLevel: 'Executive Academic Control',
      badgeColor: 'border-purple-500/30 text-purple-400 bg-purple-500/10',
    },
    {
      id: 'teacher',
      title: 'Teacher Portal',
      icon: GraduationCap,
      description: 'Daily classroom workflows, syllabus, and assessments',
      modules: ['Classroom Attendance Rosters', 'Direct Subject Marks Entry', 'Assignment Creation & Turn-in', 'Class Timetable Schedules', 'Student Qualitative Notes'],
      accessLevel: 'Instructional Scope',
      badgeColor: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
    },
    {
      id: 'student',
      title: 'Student Portal',
      icon: Users,
      description: 'Personal academic hub, fee transparency, and homework',
      modules: ['Personal Attendance Percentage', 'Weekly Timetable Schedules', 'Assignment Turn-In & Files', 'Published Examination Results', 'Tuition Fee Receipts & Challans'],
      accessLevel: 'Self-Service View',
      badgeColor: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
    },
    {
      id: 'accountant',
      title: 'Accountant',
      icon: Wallet,
      description: 'Fiscal integrity, fee counter, and payroll ledgers',
      modules: ['Fee Invoicing & Collection', 'Challan & Instant Receipt Generation', 'Partial Payment Logs', 'School Operational Expenses', 'Faculty Payroll & Salaries'],
      accessLevel: 'Fiscal Management',
      badgeColor: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
    },
    {
      id: 'receptionist',
      title: 'Receptionist / Front Desk',
      icon: Building,
      description: 'First-point-of-contact visitor and admissions desk',
      modules: ['New Student Inquiries & Admissions', 'Fast Global Student Search', 'Guardian Contact Lookup', 'Fee Status Verification', 'Notice Board Publishing'],
      accessLevel: 'Front-Desk Operations',
      badgeColor: 'border-teal-500/30 text-teal-400 bg-teal-500/10',
    },
  ];

  const currentRole = roles.find((r) => r.id === activeRole) || roles[0];

  const matrixRows = [
    { module: 'Students', view: true, add: true, edit: true, approve: false, export: true, print: true },
    { module: 'Fees & Finance', view: true, add: false, edit: true, approve: true, export: true, print: true },
    { module: 'Exams & Results', view: true, add: true, edit: true, approve: true, export: true, print: true },
    { module: 'Attendance', view: true, add: true, edit: true, approve: false, export: true, print: true },
    { module: 'Teachers & Staff', view: true, add: true, edit: true, approve: false, export: true, print: false },
    { module: 'School Settings', view: true, add: false, edit: true, approve: false, export: false, print: false },
  ];

  return (
    <section className="relative bg-[#10131D] py-24 sm:py-32 overflow-hidden border-t border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/30 px-3.5 py-1 text-xs font-semibold text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Built for Every Role</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display">
            One Platform. Different Experiences.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#A7AEC1] sm:text-lg">
            Give every stakeholder exactly what they need — without exposing confidential records or overloading simple interfaces.
          </p>
        </div>

        {/* 6 Role Switcher Pills */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
          {roles.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.id}
                onClick={() => setActiveRole(r.id as any)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                  activeRole === r.id
                    ? 'bg-white text-black shadow-lg shadow-white/10'
                    : 'border border-white/10 bg-[#171B27] text-[#A7AEC1] hover:bg-[#1B1F2C] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{r.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Role Showcase Card */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#131722] p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#171B27] border border-white/10">
                <currentRole.icon className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{currentRole.title}</h3>
                <p className="text-xs text-[#A7AEC1] mt-0.5">{currentRole.description}</p>
              </div>
            </div>
            <Badge className={`self-start sm:self-center px-3 py-1 text-xs ${currentRole.badgeColor}`}>
              {currentRole.accessLevel}
            </Badge>
          </div>

          <div className="mt-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#77809A]">
              Scoped Access Privileges
            </h4>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {currentRole.modules.map((mod) => (
                <div key={mod} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-[#171B27] p-3">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-medium text-white">{mod}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PERMISSIONS MATRIX SECTION (Requested in prompt) */}
        <div className="mt-20">
          <div className="text-center">
            <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl font-display">
              Powerful Permissions Without Complexity
            </h3>
            <p className="mt-2 text-sm text-[#A7AEC1]">
              Control exactly what every role can see and manage with a fine-grained administrative access grid.
            </p>
          </div>

          {/* Matrix Table */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#131722] shadow-xl">
            <div className="overflow-x-auto thin-scroll">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 bg-[#171B27] text-[#77809A] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3.5 px-6">Module</th>
                    <th className="py-3.5 px-4 text-center">View</th>
                    <th className="py-3.5 px-4 text-center">Add</th>
                    <th className="py-3.5 px-4 text-center">Edit</th>
                    <th className="py-3.5 px-4 text-center">Approve</th>
                    <th className="py-3.5 px-4 text-center">Export</th>
                    <th className="py-3.5 px-4 text-center">Print</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {matrixRows.map((row) => (
                    <tr key={row.module} className="transition-colors hover:bg-white/[0.02]">
                      <td className="py-3 px-6 font-semibold text-white">{row.module}</td>
                      <td className="py-3 px-4 text-center">
                        {row.view ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-[#77809A]" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.add ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-[#77809A]" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.edit ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-[#77809A]" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.approve ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-[#77809A]" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.export ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-[#77809A]" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.print ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-[#77809A]" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
