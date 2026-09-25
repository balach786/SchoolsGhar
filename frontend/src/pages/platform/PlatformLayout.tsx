import { useId } from 'react';
import { ActiveSidebarPill, SidebarEntrance, SidebarMenu, SidebarItem } from '@/components/motion';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { LucideIcon } from 'lucide-react';
import { RequestErrorNotice } from '@/components/RequestErrorNotice';
import { PageTransition } from '@/components/PageTransition';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  Layers,
  CreditCard,
  Bell,
  LogOut,
  ShieldAlert,
  GraduationCap,
  ExternalLink,
  ChevronRight,
  CheckCheck,
  Sparkles,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage } from '@/lib/api';

interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}


function PlatformSidebar({ items: navItems, email, onNavigate }: { items: {label:string;to:string;icon:LucideIcon;badge?:string}[]; email?:string; onNavigate?:()=>void }) {
 const indicatorId=useId();
 return (      <div className="platform-sidebar-content flex h-full flex-col">
        {/* Logo / Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-border">
          <Link to="/platform-admin/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-600 to-teal-500 text-foreground shadow-md shadow-teal-600/30">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-sm tracking-tight text-foreground leading-none">School Management</p>
              <p className="text-[10px] text-primary font-semibold tracking-wider uppercase mt-0.5">
                Platform
              </p>
            </div>
          </Link>
        </div>

        {/* Nav Links */}
        <SidebarMenu className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Platform Management
          </div>
          {navItems.map((item) => (
            <SidebarItem key={item.to}><NavLink
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `sidebar-link relative isolate flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'text-brand-900'
                    : 'text-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              {({ isActive }) => <>{isActive && <ActiveSidebarPill id={indicatorId}/>}<div className="flex items-center gap-2.5">
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                  {item.badge}
                </span>
              )}
            </>}</NavLink></SidebarItem>
          ))}
        </SidebarMenu>

        {/* Bottom Platform Info */}
        <div className="p-3 border-t border-border">
          <div className="p-3 rounded-lg bg-background border border-border text-xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-[11px]">
              <span>Signed In As:</span>
              <span className="text-success font-medium">Owner</span>
            </div>
            <p className="font-semibold text-foreground truncate">{email}</p>
          </div>
        </div>
      </div>);
}

export function PlatformLayout() {
  const { user, logout, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState<number>(0);
  const menuTrigger=useRef<HTMLButtonElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchPlatformData = async () => {
    try {
      const [notifsRes, dashRes] = await Promise.all([
        api.get<{ success: boolean; data: { notifications: NotificationItem[]; unreadCount: number } }>(
          '/platform/notifications?limit=10'
        ),
        api.get<{ success: boolean; data: { pendingPayments: number } }>('/platform/dashboard'),
      ]);

      if (notifsRes.data?.success) {
        setNotifications(notifsRes.data.data.notifications || []);
        setUnreadCount(notifsRes.data.data.unreadCount || 0);
      }
      if (dashRes.data?.success) {
        setPendingPaymentsCount(dashRes.data.data.pendingPayments || 0);
      }
    } catch {
      // ignore poll failures
    }
  };

  useEffect(() => {
    if (isAuthenticated && (user?.isPlatformAdmin || user?.role === 'platform_admin')) {
      fetchPlatformData();
      const interval = setInterval(fetchPlatformData, 30000); // 30s poll for new registrations & payments
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user]);

  const markAllRead = async () => {
    try {
      await api.post('/platform/notifications/mark-read', { markAll: true });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error('Failed to mark notifications read', { description: apiErrorMessage(err) });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Authenticating Platform Session...
      </div>
    );
  }

  // Enforce Platform Admin role
  if (!isAuthenticated || (!user?.isPlatformAdmin && user?.role !== 'platform_admin')) {
    return <Navigate to="/platform-admin/login" replace />;
  }

  const navItems = [
    { label: 'Platform Dashboard', to: '/platform-admin/dashboard', icon: LayoutDashboard },
    { label: 'Schools / Customers', to: '/platform-admin/customers', icon: Building2 },
    {
      label: 'Payment Proofs',
      to: '/platform-admin/payments',
      icon: Receipt,
      badge: pendingPaymentsCount > 0 ? `${pendingPaymentsCount} Pending` : undefined,
    },
    { label: 'Subscription Plans', to: '/platform-admin/plans', icon: Layers },
    { label: 'Payment Methods', to: '/platform-admin/payment-methods', icon: CreditCard },
  ];

  return (
    <div className="platform-shell min-h-screen bg-background text-foreground flex flex-col md:flex-row selection:bg-teal-500 selection:text-foreground">
      {/* Mobile Topbar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-background">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white font-bold text-xs">
            PA
          </div>
          <span className="font-bold text-sm text-foreground">Platform Admin</span>
        </div>
        <button
          ref={menuTrigger} aria-label="Toggle platform navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-muted-foreground hover:text-foreground"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar (Desktop + Mobile overlay) */}
      <SidebarEntrance className="hidden md:flex w-64 shrink-0 flex-col border-r border-border"><PlatformSidebar items={navItems} email={user?.email}/></SidebarEntrance>
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}><DialogContent className="app-drawer platform-drawer" onCloseAutoFocus={event=>{event.preventDefault();menuTrigger.current?.focus();}}><DialogTitle className="sr-only">Platform navigation</DialogTitle><DialogDescription className="sr-only">Manage schools and subscriptions.</DialogDescription><PlatformSidebar items={navItems} email={user?.email} onNavigate={()=>setMobileMenuOpen(false)}/></DialogContent></Dialog>


      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Platform Admin Top Header */}
        <header className="h-16 px-6 border-b border-border bg-background backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-primary text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Platform administration
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification Bell Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Platform notifications" variant="ghost" size="icon" className="relative text-foreground hover:text-foreground">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border-border text-foreground p-2">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
                  <span className="text-xs font-bold text-foreground">Platform Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1"
                    >
                      <CheckCheck className="w-3 h-3" /> Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-border py-1">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No notifications yet</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n._id}
                        className={`p-2.5 text-xs transition-colors rounded ${
                          !n.isRead ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        <p className="font-semibold text-foreground">{n.title}</p>
                        <p className="text-[11px] text-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        <span className="text-[10px] text-muted-foreground mt-1 block">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Logout Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                navigate('/platform-admin/login');
              }}
              className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground hover:text-foreground hover:bg-muted text-xs"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-background">
          <RequestErrorNotice route={location.pathname}/><ErrorBoundary key={location.pathname}><PageTransition><Outlet /></PageTransition></ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

