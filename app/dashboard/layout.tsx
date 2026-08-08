'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import ThemeToggle from '@/components/ui/ThemeToggle';
import CommandPalette from '@/components/ui/CommandPalette';
import { useOps } from '@/lib/hooks/useOps';
import {
  LayoutDashboard,
  Building2,
  Sparkles,
  Receipt,
  Database,
  Calculator,
  CalendarClock,
  Search,
  LogOut,
  Menu,
  X,
  Shield,
  ShieldCheck,
  Cpu,
  Sliders,
  Landmark,
  MessagesSquare,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NavItem {
  id: string;
  label: string;
  phase: string;
  href: string;
  icon: any;
  // When true, the item is intentionally kept in this list (routing, icons,
  // phase metadata all stay intact) but omitted from the rendered sidebar.
  // Used for features that are built but deliberately not surfaced yet
  // (e.g. Infra & Cost needs a real AWS integration before it's shown).
  hidden?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', phase: 'phase 1', href: '/dashboard', icon: LayoutDashboard },
  { id: 'organizations', label: 'Organizations', phase: 'phase 1', href: '/dashboard/organizations', icon: Building2 },
  { id: 'plans', label: 'Subscription Plans', phase: 'phase 2', href: '/dashboard/plans', icon: Sparkles },
  { id: 'billing', label: 'Billing & Revenue', phase: 'phase 2', href: '/dashboard/billing', icon: Receipt },
  { id: 'payouts', label: 'Payout Accounts', phase: 'phase 2', href: '/dashboard/payouts', icon: Landmark },
  { id: 'messaging', label: 'Messaging', phase: 'phase 2', href: '/dashboard/messaging', icon: MessagesSquare },
  { id: 'audit', label: 'Audit Log', phase: 'phase 3', href: '/dashboard/audit-log', icon: Database },
  { id: 'calculator', label: 'Contest Calculator', phase: 'phase 4', href: '/dashboard/calculator', icon: Calculator },
  { id: 'bookings', label: 'Bookings', phase: 'phase 4', href: '/dashboard/bookings', icon: CalendarClock },
  { id: 'infra', label: 'Infra & Cost', phase: 'phase 5', href: '/dashboard/infra', icon: Cpu, hidden: true },
  { id: 'flags', label: 'Feature Flags', phase: 'phase 6', href: '/dashboard/flags', icon: Sliders, hidden: true },
];

// Items actually rendered in the sidebar — `hidden` items stay defined above
// (route, icon, phase label untouched) but are skipped here until they're
// ready to ship. Nothing about the underlying page/route is removed.
const VISIBLE_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.hidden);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { admin, isLoading, isFetching, logout } = useCurrentAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { featureFlags, toggleFlag } = useOps();

  const isMaintenanceActive = featureFlags?.find((f) => f.key === 'maintenance_mode')?.isEnabled || false;
  const isSupport = admin?.role === 'SUPPORT';

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const [impersonatedOrgId, setImpersonatedOrgId] = useState<string | null>(null);
  const [impersonatedOrgName, setImpersonatedOrgName] = useState<string | null>(null);

  // Read impersonation status from localStorage on mount (hydration safe)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setImpersonatedOrgId(localStorage.getItem('quizbuzz_impersonated_org_id'));
      setImpersonatedOrgName(localStorage.getItem('quizbuzz_impersonated_org_name'));
    }
  }, []);

  useEffect(() => {
    const handleImpersonate = (e: Event) => {
      const customEvent = e as CustomEvent<{ orgId: string | null; orgName: string | null }>;
      const targetId = customEvent.detail.orgId;
      const targetName = customEvent.detail.orgName;

      setImpersonatedOrgId(targetId);
      setImpersonatedOrgName(targetName);

      if (targetId) {
        localStorage.setItem('quizbuzz_impersonated_org_id', targetId);
        localStorage.setItem('quizbuzz_impersonated_org_name', targetName || '');
        toast('Impersonation Active', `You are now viewing the system as ${targetName}.`, 'info');
      } else {
        localStorage.removeItem('quizbuzz_impersonated_org_id');
        localStorage.removeItem('quizbuzz_impersonated_org_name');
        toast('Impersonation Ended', 'Returned to your primary operator credentials.', 'success');
      }

      // Invalidate queries to automatically reload filtered statistics
      queryClient.invalidateQueries();
    };

    window.addEventListener('quizbuzz_impersonate', handleImpersonate);
    return () => {
      window.removeEventListener('quizbuzz_impersonate', handleImpersonate);
    };
  }, [queryClient, toast]);

  // Handle keyboard shortcut for command palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Auth guard: wait for the session query to fully settle after mount
  // before deciding the user is logged out. `isLoading` alone is NOT
  // enough here — because useCurrentAdmin() seeds the query with cached
  // `initialData`, react-query reports isLoading:false immediately even
  // while it's still validating that cache against the server in the
  // background. Gating on `isFetching` too means we only redirect once
  // that validation has actually finished (and, per getCurrentSession(),
  // it only resolves to a falsy session on a definitive 401 — not on a
  // transient network blip). This is what previously caused a hard
  // refresh to sometimes bounce a still-validly-logged-in admin to /login.
  const authSettled = !isLoading && !isFetching;

  useEffect(() => {
    if (isMounted && authSettled && !admin) {
      router.push('/login');
    }
  }, [admin, authSettled, isMounted, router]);

  if (!isMounted || isLoading) return null;
  if (!admin && !authSettled) return null; // still validating a cached-but-unconfirmed session
  if (!admin) return null;

  const handleSelectOrgFromSearch = (orgId: string) => {
    router.push(`/dashboard/organizations?orgId=${orgId}`);
  };

  const isNavItemActive = (item: NavItem) =>
    item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);

  const currentSectionLabel = NAV_ITEMS.find((n) => isNavItemActive(n))?.label || 'Ops Control';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans selection:bg-primary/20">
      {/* Maintenance Mode Banner */}
      {isMaintenanceActive && (
        <div
          id="maintenance-active-banner"
          className="bg-red-600 text-white text-xs font-bold py-2.5 px-4 flex items-center justify-between shadow-md select-none text-center shrink-0 sticky top-0 z-50 border-b border-red-700"
        >
          <div className="flex items-center gap-2 mx-auto sm:mx-0">
            <span className="relative flex h-2 w-2 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span>⚠ Maintenance mode is ACTIVE platform-wide • All live operations are suspended</span>
          </div>
          <button
            id="disable-maintenance-banner-btn"
            disabled={isSupport}
            onClick={async () => {
              if (isSupport) {
                toast('Clearance Error', 'SUPPORT operators cannot toggle maintenance mode.', 'error');
                return;
              }
              try {
                await toggleFlag({ key: 'maintenance_mode', isEnabled: false });
                toast('Maintenance Mode Deactivated', 'Platform operations are now restored to active status.', 'success');
              } catch (e: any) {
                toast('Deactivation Failed', e.message || 'Error deactivating maintenance mode.', 'error');
              }
            }}
            className="ml-4 px-3 py-1 bg-white hover:bg-white/95 text-red-600 hover:text-red-700 rounded-md font-bold text-[10px] uppercase transition-all shadow-sm cursor-pointer shrink-0 disabled:opacity-50"
          >
            Turn Off
          </button>
        </div>
      )}


      <div className="flex-1 flex min-h-0">

      {/* Search Command Palette Overlay */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      {/* MOBILE SIDEBAR PANEL OVERLAY / DRAWER */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden pointer-events-auto">
            {/* Scrim Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            />

            {/* Sidebar Slideout */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 left-0 w-64 bg-background/95 backdrop-blur-xl border-r border-border/40 shadow-2xl p-4 flex flex-col justify-between"
            >
              {/* Header */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-border/40 pb-4">
                  <div className="space-y-0.5">
                    <h1 className="text-xl font-bold tracking-tight text-foreground font-sans">
                      QuizBuzz <span className="text-primary font-light">— Ops</span>
                    </h1>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-sans">
                      SaaS Internal Control
                    </p>
                  </div>
                  <button
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className="p-1.5 rounded-md hover:bg-secondary/50 text-muted-foreground transition-colors cursor-pointer"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>

                {/* Nav Links */}
                <nav className="space-y-1">
                  {VISIBLE_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = isNavItemActive(item);

                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          router.push(item.href);
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold font-sans transition-all group relative ${
                          isActive
                            ? 'text-primary-foreground bg-primary shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5 shrink-0" />
                        <div className="flex-1 text-left">
                          <span>{item.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Footer */}
              <div className="space-y-4 pt-4 border-t border-border/40">
                <div className="bg-secondary/40 p-3 rounded-xl flex items-center gap-3">
                  <img
                    src={admin.avatarUrl}
                    alt={admin.name}
                    className="h-8 w-8 rounded-full border border-border/60 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-foreground truncate block leading-none">{admin.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate block mt-0.5 font-mono">{admin.email}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    logout();
                    setIsMobileSidebarOpen(false);
                    toast('Logged Out', 'Your session has been terminated.', 'info');
                  }}
                  className="w-full h-9 rounded-md bg-destructive/10 hover:bg-destructive/15 text-destructive font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Logout Operators Desk</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DESKTOP FIXED SIDEBAR SHELL */}
      <aside
        id="desktop-sidebar"
        className={`hidden lg:flex flex-col justify-between fixed inset-y-0 left-0 bg-background/80 backdrop-blur-xl border-r border-border/40 shadow-lg shadow-background/5 transition-all duration-300 z-30 select-none ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Top Branding Header area */}
        <div className="space-y-6 pt-6 px-4">
          <div
            id="sidebar-logo-header"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="flex items-center gap-3 cursor-pointer p-2 hover:bg-secondary/40 rounded-xl transition-colors group relative"
            title="Toggle Sidebar Layout"
          >
            <div className="p-2 bg-primary/15 text-primary rounded-lg shrink-0 group-hover:scale-105 transition-transform">
              <Shield className="h-5 w-5" />
            </div>

            <AnimatePresence mode="wait">
              {!isSidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0"
                >
                  <h1 className="text-base font-bold tracking-tight text-foreground truncate">
                    QuizBuzz <span className="text-primary font-light">— Ops</span>
                  </h1>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">
                    Internal Ops Panel
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {VISIBLE_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = isNavItemActive(item);

              return (
                <button
                  id={`nav-item-${item.id}`}
                  key={item.id}
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold font-sans transition-all group relative cursor-pointer ${
                    isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  {/* Sliding Background Pill */}
                  {isActive && (
                    <motion.div
                      layoutId="activeNav"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      className="absolute inset-0 bg-primary rounded-lg -z-10 shadow-sm shadow-primary/25"
                    />
                  )}

                  <Icon className={`h-4.5 w-4.5 shrink-0 transition-transform group-hover:scale-110`} />

                  <AnimatePresence mode="wait">
                    {!isSidebarCollapsed && (
                      <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex-1 text-left truncate flex items-center justify-between"
                      >
                        <span className="truncate">{item.label}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom operator identity block */}
        <div className="p-4 border-t border-border/40 space-y-4">
          <div className="bg-secondary/50 rounded-xl p-3 flex items-center gap-3 transition-all relative overflow-hidden">
            <img
              src={admin.avatarUrl}
              alt={admin.name}
              className="h-8 w-8 rounded-full border border-border/60 shrink-0"
              referrerPolicy="no-referrer"
            />

            <AnimatePresence mode="wait">
              {!isSidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0"
                >
                  <span className="text-xs font-semibold text-foreground truncate block leading-none">{admin.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate block mt-1.5 font-mono leading-none">
                    {admin.role.replace('_', ' ')}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            id="sidebar-logout-btn"
            onClick={() => {
              logout();
              toast('Logged Out', 'Your session has been terminated.', 'info');
            }}
            className={`w-full h-9 rounded-md bg-destructive/10 hover:bg-destructive/15 hover:text-destructive text-destructive font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
              isSidebarCollapsed ? 'px-0' : 'px-4'
            }`}
            title="Terminate Active Session"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Logout Operator</span>}
          </button>
        </div>
      </aside>

      {/* MAIN MAIN VIEW PORTAL */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
        isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
      }`}>

        {/* Sticky top-header rail */}
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/40 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 select-none shrink-0">

          {/* Mobile hamburger menu & section label */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-md transition-colors cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div>
              <h2 className="font-bold text-base sm:text-lg tracking-tight text-foreground leading-none">
                {currentSectionLabel}
              </h2>
              <span className="text-[10px] text-muted-foreground hidden sm:block mt-0.5">
                QuizBuzz Platform Ops • Sandbox Environment
              </span>
            </div>
          </div>

          {/* Quick search and control deck */}
          <div className="flex items-center gap-2 sm:gap-3.5">


            {/* Global Cmd+K Search trigger */}
            <button
              id="topbar-search-trigger"
              onClick={() => setIsCommandPaletteOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-secondary/30 hover:bg-secondary/50 border border-border/40 rounded-md transition-colors font-sans w-28 sm:w-48 cursor-pointer"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left truncate hidden sm:inline">Search tenant...</span>
              <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded border border-border/50 bg-card font-mono text-[9px]">
                ⌘K
              </kbd>
            </button>

            {/* Read-only role badge — reflects the admin's actual DB-assigned
                role from the session (JWT-backed), not something a user can
                change from the UI. There is deliberately no client-side role
                switcher: it previously let an admin locally spoof their own
                displayed role, which the real backend never trusted anyway,
                but which made the dashboard show unlocked actions that would
                then fail server-side. */}
            <span
              id="current-role-badge"
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border/50 bg-card text-muted-foreground"
              title="Your role is assigned by a Super Admin and cannot be changed from this menu."
            >
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {admin.role.replace('_', ' ')}
            </span>

            {/* Theme switcher */}
            <ThemeToggle />
          </div>
        </header>

        {/* Page Content area container */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pointer-events-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      </div>
    </div>
  );
}
