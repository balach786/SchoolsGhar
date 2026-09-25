import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

interface FooterProps {
  onRequestDemo: () => void;
}

export function Footer({ onRequestDemo }: FooterProps) {
  const platformLinks = [
    { label: 'Dashboard', href: '#hero' },
    { label: 'Students', href: '#features' },
    { label: 'Teachers', href: '#features' },
    { label: 'Attendance', href: '#attendance' },
    { label: 'Exams', href: '#exams' },
    { label: 'Fees', href: '#finance' },
  ];

  const academicLinks = [
    { label: 'Sessions', href: '#features' },
    { label: 'Classes', href: '#features' },
    { label: 'Sections', href: '#features' },
    { label: 'Subjects', href: '#academics' },
    { label: 'Timetable', href: '#academics' },
    { label: 'Results', href: '#exams' },
  ];

  const resourceLinks = [
    { label: 'Documentation', href: '#features' },
    { label: 'Help Center', href: '#hero' },
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
  ];

  const companyLinks = [
    { label: 'About', href: '#hero' },
    { label: 'Contact', href: '#pricing' },
    { label: 'Request Demo', action: onRequestDemo },
  ];

  return (
    <footer className="border-t border-white/10 bg-[#0A0D14] text-[#A7AEC1] overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-6">
          {/* Brand Info & Official White Logo */}
          <div className="lg:col-span-2">
            <a href="#hero" className="inline-block">
              <img
                src="/logo.png"
                alt="School Management System"
                className="h-9 sm:h-10 w-auto object-contain"
              />
            </a>
            <p className="mt-4 text-sm font-semibold text-white">
              School Management System
            </p>
            <p className="mt-1 text-xs text-[#77809A] leading-relaxed max-w-sm">
              Everything your school needs in one platform. Built for modern schools, academies, principals, teachers, accountants, and education administrators.
            </p>

            <div className="mt-6 flex items-center gap-2 text-xs text-indigo-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>System Status: 100% Operational</span>
            </div>
          </div>

          {/* Column 1: Platform */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Platform
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs">
              {platformLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="transition-colors hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 2: Academics */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Academics
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs">
              {academicLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="transition-colors hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Resources */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Resources
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs">
              {resourceLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="transition-colors hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Company */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Company
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  {link.action ? (
                    <button
                      onClick={link.action}
                      className="text-left transition-colors hover:text-white text-indigo-400 font-medium"
                    >
                      {link.label}
                    </button>
                  ) : (
                    <a href={link.href} className="transition-colors hover:text-white">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
              <li className="pt-2">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1 rounded-md bg-[#171B27] px-2.5 py-1 text-[11px] font-semibold text-white border border-white/10 hover:bg-[#1B1F2C]"
                >
                  <span>Portal Login</span>
                  <ArrowUpRight className="h-3 w-3 text-indigo-400" />
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer Bottom Line */}
        <div className="mt-16 flex flex-col sm:flex-row items-center justify-between border-t border-white/5 pt-8 text-xs text-[#77809A]">
          <p>© 2026 School Management System. All rights reserved.</p>
          <p className="mt-2 sm:mt-0">Enterprise EdTech SaaS Platform</p>
        </div>
      </div>
    </footer>
  );
}
