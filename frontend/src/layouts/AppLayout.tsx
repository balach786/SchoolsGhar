import { RequestErrorNotice } from '@/components/RequestErrorNotice';
import { PageTransition } from '@/components/PageTransition';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Search, Bell, ChevronLeft, ChevronRight, GraduationCap, Menu, Monitor, Moon, Sun, LogIn, LogOut, CalendarRange, AlertCircle, KeyRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NAV_SECTIONS, visibleNavigation } from '@/config/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/context/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';
import { api } from '@/lib/api';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';

function SchoolLogo({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  const [schoolName, setSchoolName] = useState<string>('School Prime');
  const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const fetchSettings = () => {
      api
        .get<{ success: boolean; data: { schoolName?: string; schoolLogoUrl?: string | null } }>('/school-settings')
        .then((res) => {
          if (mounted && res.data?.data) {
            if (res.data.data.schoolName) {
              setSchoolName(res.data.data.schoolName);
            }
            if (res.data.data.schoolLogoUrl !== undefined) {
              setSchoolLogoUrl(res.data.data.schoolLogoUrl);
              setLogoError(false);
            }
          }
        })
        .catch(() => {});
    };

    fetchSettings();

    const handleSettingsUpdated = () => fetchSettings();
    window.addEventListener('schoolSettingsUpdated', handleSettingsUpdated);

    return () => {
      mounted = false;
      window.removeEventListener('schoolSettingsUpdated', handleSettingsUpdated);
    };
  }, []);

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#1E3A8A] shadow-md ring-2 ring-white/20 transition-transform group-hover:scale-105 overflow-hidden">
        {schoolLogoUrl && !logoError ? (
          <img src={schoolLogoUrl} alt="Logo" className="h-full w-full object-contain" onError={() => setLogoError(true)} />
        ) : (
          <GraduationCap className="h-5 w-5 text-[#F59E0B]" />
        )}
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-extrabold tracking-tight text-white">{schoolName}</p>
          <p className="truncate text-[10px] font-medium text-white/70">Academic Portal v2.4</p>
        </div>
      )}
    </div>
  );
}

function ActiveSessionBadge() {
  const [sessionName, setSessionName] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    api
      .get<{ success: boolean; data: Array<{ name: string; isActive: boolean }> }>('/academic-sessions/lookup')
      .then((res) => {
        if (mounted && res.data?.data) {
          const active = res.data.data.find((s) => s.isActive);
          if (active) setSessionName(active.name);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (!sessionName) {
    return (
      <button
        type="button"
        onClick={() => navigate('/sessions')}
        className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
        title="No active academic session. Click to configure."
      >
        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
        <span>No Active Session</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/sessions')}
      className="group hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#1E3A8A]/20 bg-[#1E3A8A]/5 px-3 py-1 text-xs font-semibold text-[#1E3A8A] dark:text-blue-200 dark:border-blue-400/20 dark:bg-blue-900/30 hover:bg-[#1E3A8A]/10 hover:border-[#1E3A8A]/40 transition-all cursor-pointer"
      title="Current active academic session. Click to manage sessions."
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <CalendarRange className="h-3.5 w-3.5 text-[#F59E0B]" />
      <span>Session {sessionName}</span>
      <ChevronRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#1E3A8A]/60 dark:text-blue-300" />
    </button>
  );
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" aria-label="Theme">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 rounded-xl">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Appearance</DropdownMenuLabel>
        {(
          [
            { value: 'light', label: 'Light', icon: Sun },
            { value: 'dark', label: 'Dark', icon: Moon },
            { value: 'system', label: 'System', icon: Monitor },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)} className="cursor-pointer rounded-lg">
            <Icon className="h-4 w-4" />
            {label}
            {theme === value && <span className="ml-auto text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarTooltip({ label, visible }: { label: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute left-full ml-3 hidden rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xl ring-1 ring-white/20 group-hover/item:block z-50 whitespace-nowrap backdrop-blur-sm">
      {label}
      <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900/95" />
    </div>
  );
}

interface SidebarContentProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  setCollapsed?: (val: boolean) => void;
  isMobile?: boolean;
}

function SidebarContent({ onNavigate, collapsed = false, setCollapsed, isMobile = false }: SidebarContentProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [sessionName, setSessionName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .get<{ success: boolean; data: Array<{ name: string; isActive: boolean }> }>('/academic-sessions/lookup')
      .then((res) => {
        if (mounted && res.data?.data) {
          const active = res.data.data.find((s) => s.isActive);
          if (active) setSessionName(active.name);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const toggleExpand = (e: React.MouseEvent, label: string) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedItems(prev => ({ ...prev, [label]: !prev[label] }));
  };

  // Filter navigation by the user's live permissions + role restrictions
  const visibleSections = visibleNavigation(user);

  const isItemActive = (to: string) => {
    if (to === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/app';
    if (to === '/exams') return location.pathname === '/exams' || location.pathname.startsWith('/exams/');
    // Finance Hub: only active on /finance itself
    if (to === '/finance') return location.pathname === '/finance';
    // Fees: only active on /fees routes (not /salaries, /expenses, /reports, /finance)
    if (to === '/fees') return location.pathname === '/fees' || location.pathname.startsWith('/fees/') || location.pathname === '/payments';
    // Payroll & Expenses: active on /salaries or /expenses
    if (to === '/salaries') return location.pathname === '/salaries' || location.pathname === '/expenses';
    if (to === '/data-management') return location.pathname.startsWith('/data-management');
    if (to === '/students') return location.pathname === '/students' || location.pathname.startsWith('/students/');
    if (to === '/teachers') return location.pathname === '/teachers' || location.pathname.startsWith('/teachers/');
    if (to === '/users') return location.pathname === '/users' || location.pathname.startsWith('/users/');
    if (to === '/sessions') return location.pathname.startsWith('/sessions');
    if (to === '/classes') return location.pathname === '/classes' || location.pathname.startsWith('/classes/') || location.pathname.startsWith('/sections') || location.pathname.startsWith('/subjects') || location.pathname.startsWith('/promotions');
    if (to === '/daily-attendance') return location.pathname.startsWith('/daily-attendance') || location.pathname.startsWith('/attendance') || location.pathname.startsWith('/teacher-attendance') || location.pathname.startsWith('/non-teaching-attendance');
    if (to === '/timetable') return location.pathname.startsWith('/timetable');
    if (to === '/assignments') return location.pathname.startsWith('/assignments');
    if (to === '/notices') return location.pathname.startsWith('/notices');
    if (to === '/reports') return location.pathname === '/reports';
    if (to === '/settings') return location.pathname.startsWith('/settings');
    if (to === '/billing') return location.pathname.startsWith('/billing');
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  // Auto-expand parent items if they have an active sub-item
  useEffect(() => {
    setExpandedItems(prev => {
      const next = { ...prev };
      let changed = false;
      visibleSections.forEach(section => {
        section.items.forEach(item => {
          if (item.subItems && item.subItems.some(sub => isItemActive(sub.to))) {
            if (!next[item.label]) {
              next[item.label] = true;
              changed = true;
            }
          }
        });
      });
      return changed ? next : prev;
    });
    // We intentionally only depend on pathname here so it re-evaluates on navigation
  }, [location.pathname]);

  const isEffectiveCollapsed = collapsed && !isMobile;

  return (
    <div className="relative flex h-full flex-col bg-[#1E3A8A] text-white select-none">
      {/* Brand Header */}
      <div
        className={cn(
          'flex h-16 items-center border-b border-white/10 transition-all duration-300',
          isEffectiveCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'
        )}
      >
        {isEffectiveCollapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed?.(false)}
            className="group flex flex-col items-center gap-1 py-1 focus:outline-none"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#1E3A8A] shadow-md ring-2 ring-white/20 transition-transform group-hover:scale-105">
              <GraduationCap className="h-5 w-5 text-[#F59E0B]" />
            </div>
            <ChevronRight className="h-3 w-3 text-white/70 transition-all group-hover:translate-x-0.5 group-hover:text-white" />
          </button>
        ) : (
          <>
            <SchoolLogo collapsed={false} />
            {!isMobile && setCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(true)}
                className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10 rounded-lg shrink-0 hidden lg:flex transition-colors"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* Navigation list */}
      <nav className="flex-1 min-h-0 space-y-3 overflow-y-auto overflow-x-visible pl-2.5 pr-0 py-2.5 no-scrollbar">
        {visibleSections.map((section, index) => (
          <div key={section.label || `section-${index}`} className="relative">
            {!isEffectiveCollapsed ? (
              section.label && (
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-white/45 select-none">
                  {section.label}
                </p>
              )
            ) : (
              section.label && <div className="my-1.5 mr-2.5 border-t border-white/10" />
            )}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isItemActive(item.to) || !!(item.subItems?.some(sub => isItemActive(sub.to)));
                const hasSubItems = item.subItems && item.subItems.length > 0;
                const isExpanded = expandedItems[item.label];

                return (
                  <div key={item.to} className="relative group/item flex flex-col">
                    <NavLink
                      to={item.to}
                      onClick={onNavigate}
                      className={cn(
                        'relative flex items-center select-none transition-all duration-200',
                        isEffectiveCollapsed ? 'justify-center h-11 px-0 mr-2.5' : 'min-h-[44px] py-2 px-3.5 gap-3 mr-0',
                        active
                          ? 'text-[#1E3A8A] dark:text-blue-900 font-bold z-10'
                          : 'text-white/85 hover:text-white hover:bg-white/10 hover:translate-x-1 mr-3 rounded-xl z-0 text-[13px] font-medium'
                      )}
                    >
                      {active && (
                        <motion.div
                          layoutId="activeNavOrganicNotch"
                          className={cn(
                            'absolute inset-y-0 left-1 -right-[1px] bg-white dark:bg-background z-10 pointer-events-none shadow-[-3px_0_10px_rgba(0,0,0,0.04)]',
                            isEffectiveCollapsed ? 'rounded-l-xl' : 'rounded-l-full'
                          )}
                          transition={{
                            type: 'spring',
                            stiffness: 420,
                            damping: 32,
                            mass: 0.75,
                          }}
                        >
                          {/* Large upper organic inward curve (38px radius squircle) flush with right boundary */}
                          <svg
                            className="absolute -top-[37px] right-0 w-[38px] h-[38px] text-white dark:text-background pointer-events-none"
                            viewBox="0 0 38 38"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M 38,0 L 38,38 L 0,38 C 21,38 38,21 38,0 Z" />
                          </svg>
                          {/* Large lower organic outward curve (38px radius squircle) flush with right boundary */}
                          <svg
                            className="absolute -bottom-[37px] right-0 w-[38px] h-[38px] text-white dark:text-background pointer-events-none"
                            viewBox="0 0 38 38"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M 38,38 L 38,0 L 0,0 C 21,0 38,17 38,38 Z" />
                          </svg>
                        </motion.div>
                      )}

                      <item.icon
                        className={cn(
                          'relative z-20 shrink-0 transition-transform duration-200',
                          active
                            ? 'h-[18px] w-[18px] text-[#1E3A8A] dark:text-blue-900 font-bold scale-110'
                            : 'h-4 w-4 text-white/85 group-hover/item:text-white group-hover/item:scale-110'
                        )}
                      />

                      {!isEffectiveCollapsed && (
                        <span
                          className={cn(
                            'relative z-20 tracking-tight leading-tight',
                            active ? 'text-[13.5px] font-bold text-[#1E3A8A] dark:text-blue-900' : 'text-[13px] font-medium'
                          )}
                        >
                          {item.label}
                        </span>
                      )}

                      <SidebarTooltip label={item.label} visible={isEffectiveCollapsed} />

                      {hasSubItems && !isEffectiveCollapsed && (
                        <button 
                          onClick={(e) => toggleExpand(e, item.label)} 
                          className={cn(
                            "absolute right-2 z-20 p-1 transition-transform",
                            active ? "text-[#1E3A8A] dark:text-blue-900 hover:opacity-80" : "text-white/50 hover:text-white"
                          )}
                        >
                          <ChevronRight className={cn(
                            "h-4 w-4 transition-transform",
                            isExpanded ? "rotate-90" : "",
                            isExpanded && !active ? "text-white" : ""
                          )} />
                        </button>
                      )}
                    </NavLink>
                    
                    {hasSubItems && isExpanded && !isEffectiveCollapsed && (
                      <div className="ml-[42px] mr-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                        {item.subItems!.map((sub) => {
                          const subActive = isItemActive(sub.to);
                          return (
                            <NavLink
                              key={sub.to}
                              to={sub.to}
                              onClick={onNavigate}
                              className={cn(
                                'block rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                                subActive
                                  ? 'bg-white/10 text-white font-bold'
                                  : 'text-white/60 hover:bg-white/10 hover:text-white'
                              )}
                            >
                              {sub.label}
                            </NavLink>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Section: Session Card + User Footer */}
      <div className={cn('pb-3 transition-all duration-300', isEffectiveCollapsed ? 'px-2 space-y-2' : 'px-3 space-y-2.5')}>
        {/* School Year / Session Card */}
        {!isEffectiveCollapsed ? (
          <div className="rounded-xl bg-white/10 p-2.5 border border-white/10 text-center relative overflow-hidden group hover:bg-white/15 hover:border-white/20 transition-all duration-200">
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <span className="h-2 w-2 rounded-full bg-[#F59E0B] animate-pulse" />
              <span className="text-[11px] font-bold text-white tracking-wide">
                {sessionName ? `School Year ${sessionName}` : 'No Active Session'}
              </span>
            </div>
            <p className="text-[10px] text-white/70 font-medium">Academic Portal</p>
          </div>
        ) : (
          <div
            className="flex justify-center p-2 rounded-xl bg-white/10 border border-white/10 text-center group/dot relative"
            title={sessionName ? `School Year ${sessionName}` : 'No Active Session'}
          >
            <span className="h-2 w-2 rounded-full bg-[#F59E0B] animate-pulse" />
            <SidebarTooltip label={sessionName ? `School Year ${sessionName}` : 'No Active Session'} visible={true} />
          </div>
        )}

        {/* User Card */}
        {user && (
          <div className={cn('flex items-center pt-2 border-t border-white/10', isEffectiveCollapsed ? 'justify-center' : 'justify-between px-0.5')}>
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-7 w-7 ring-1 ring-white/20 shrink-0">
                <AvatarFallback className="bg-white/20 text-white font-bold text-[11px]">{initials(user.name)}</AvatarFallback>
              </Avatar>
              {!isEffectiveCollapsed && (
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-xs font-semibold text-white">{user.name}</p>
                  <p className="truncate text-[10px] text-white/60">{user.roleLabel ?? user.role}</p>
                </div>
              )}
            </div>
            {!isEffectiveCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10 rounded-md shrink-0 transition-colors"
                onClick={async () => {
                  await logout();
                  navigate('/login', { replace: true });
                }}
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function AppLayout() {
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sms_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, can } = useAuth();

  useEffect(() => {
    try {
      localStorage.setItem('sms_sidebar_collapsed', String(collapsed));
    } catch {}
  }, [collapsed]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Close the mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Simple breadcrumb from path segments
  const segments = location.pathname.split('/').filter(Boolean);

  const sidebarWidthClass = collapsed ? 'w-[72px]' : 'w-[214px]';
  const mainPaddingClass = collapsed ? 'lg:pl-[72px]' : 'lg:pl-[214px]';

  return (
    <div className="flex min-h-screen bg-white dark:bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'no-print fixed inset-y-0 left-0 z-30 hidden bg-[#1E3A8A] transition-all duration-300 ease-in-out lg:block',
          sidebarWidthClass
        )}
      >
        <SidebarContent collapsed={collapsed} setCollapsed={setCollapsed} />
      </aside>

      {/* Mobile Drawer */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          className="app-drawer p-0 border-none bg-transparent shadow-2xl max-w-[260px] h-full"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuTrigger.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">School navigation</DialogTitle>
          <DialogDescription className="sr-only">Navigate your school workspace.</DialogDescription>
          <SidebarContent onNavigate={() => setMobileOpen(false)} isMobile />
        </DialogContent>
      </Dialog>

      {/* Main column */}
      <div className={cn('flex min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out', mainPaddingClass)}>
        {/* Top navbar */}
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 glass-header px-4 sm:px-6">
          <Button
            ref={menuTrigger}
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex items-center gap-3">
            <p className="truncate text-sm font-semibold capitalize sm:text-base">
              {segments.length === 0
                ? 'Dashboard'
                : (NAV_SECTIONS.flatMap((section) => section.items).find((item) => item.to === '/' + segments[0])?.label ?? 'School workspace')}
            </p>
            <ActiveSessionBadge />
          </div>

          <div className="flex-1 flex justify-center items-center pointer-events-none hidden md:flex h-full">
            <img src="/logo-blue.png" alt="SchoolsGhar" className="h-12 w-auto object-contain scale-[1.20] origin-center dark:hidden" />
            <img src="/logo-white.png" alt="SchoolsGhar" className="h-12 w-auto object-contain scale-[1.20] origin-center hidden dark:block" />
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            {can('students') && (
              <Button
                variant="outline"
                className="hidden gap-2.5 text-muted-foreground md:inline-flex rounded-xl border-border/80 h-9 px-3 text-xs w-60 lg:w-72 justify-between hover:border-primary/40 hover:text-foreground"
                onClick={() => navigate('/search')}
              >
                <div className="flex items-center gap-2 truncate">
                  <Search className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">Search students, teachers, fees, exams…</span>
                </div>
                <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
                  /
                </kbd>
              </Button>
            )}
            {can('notifications') && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary"
                aria-label="Notifications"
                onClick={() => navigate('/notifications')}
              >
                <Bell className="h-4 w-4" />
              </Button>
            )}
            <ThemeSwitcher />
          </div>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Your account"
                  className="flex items-center gap-2 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  Role: <span className="ml-1 text-foreground">{user.roleLabel ?? user.role}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {user.role === 'teacher' && (
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/my-profile')}>
                    My Profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="cursor-pointer" onClick={() => setPasswordDialogOpen(true)}>
                  <KeyRound className="h-4 w-4" />
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-destructive" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" size="sm" onClick={() => navigate('/login')}>
              <LogIn className="h-4 w-4" />
              Sign in
            </Button>
          )}
        </header>

        {/* Real-time subscription & trial warning banner */}
        <SubscriptionBanner />

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 xl:p-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <RequestErrorNotice route={location.pathname} />
            <ErrorBoundary key={location.pathname}>
              <PageTransition>
                <Outlet />
              </PageTransition>
            </ErrorBoundary>
          </div>
        </main>

        <footer className="no-print border-t px-6 py-3 text-center text-xs text-muted-foreground">
          School Management System · Built for better school days.
        </footer>
      </div>
      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
    </div>
  );
}
