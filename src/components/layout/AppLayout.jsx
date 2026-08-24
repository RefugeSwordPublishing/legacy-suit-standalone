import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ClipboardList, Users, LogOut, ListTodo, Settings, Bell, ChevronUp, Globe, Inbox, MessageSquare, ChevronRight, CalendarOff, BarChart2, ShieldCheck, Target, Clock, FileText, Building2, Hash, Receipt, Link2, DollarSign, Moon, Sun, KeyRound, Bug, Tags, LifeBuoy, Search, CalendarDays } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useFeaturePermission } from '@/lib/usePermissions';
import { useTheme } from '@/lib/ThemeContext';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { useAuth } from '@/lib/AuthContext';
import { canViewMaterialsDashboard, canManageUsers, canManageTemplates, isClient, canViewClientPortal } from '@/lib/permissions';
import { canManageProjects } from '@/lib/permissions';
import NotificationBell, { useUnreadCount } from './NotificationBell';
import ProjectsMenu from './ProjectsMenu';
import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import TimeOffRequestDialog from '@/components/time-off/TimeOffRequestDialog';
import ReportIssueDialog from '@/components/layout/ReportIssueButton';
import QuickSearch from '@/components/layout/QuickSearch';

const HIGH_ROLES = ['owner', 'coo', 'admin'];

export default function AppLayout() {
  const location = useLocation();
  const { currentUser } = useCurrentUser();
  const { logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [showReportIssue, setShowReportIssue] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isHighRole = HIGH_ROLES.includes(currentUser?.role);
  const isSiteManager = currentUser?.role === 'site_manager';
  // Billing-tier gates. Treat unknown (still loading) as entitled so entitled tenants never see
  // nav flicker; only a positively-known lower tier hides the nav. isPro = Pro features;
  // hasField = Field-or-Pro features. Free floor (no sub) keeps only projects + timecards.
  const isPro = currentUser?.is_pro !== false;
  const hasField = currentUser?.has_field !== false;

  const clientOnly = isClient(currentUser);
  const canReviewRequests = canManageProjects(currentUser);

  // Feature-level permissions from PermissionSettings
  const { canRead: canReadEstimates } = useFeaturePermission('estimates');
  const { canRead: canReadInvoices } = useFeaturePermission('invoices');
  const { canRead: canReadClients } = useFeaturePermission('clients');
  const { canRead: canReadMaterials } = useFeaturePermission('materials');
  const { canRead: canReadExpenses } = useFeaturePermission('expenses');
  const { canRead: canReadReports } = useFeaturePermission('reports');
  const { canRead: canReadSubcontractors } = useFeaturePermission('subcontractors');
  const tasksSubItems = [
    { path: '/tasks', label: 'Tasks', icon: ListTodo },
    { path: '/timecards', label: 'Timecards', icon: Clock },
    { path: '/daily-goals', label: 'Daily Goals', icon: Target },
    ...(canReviewRequests ? [{ path: '/client-requests', label: 'Client Requests', icon: Inbox }] : []),
    ...(isHighRole ? [{ path: '/phase-approvals', label: 'Phase Approvals', icon: ShieldCheck }] : []),
  ];
  const isTasksActive = tasksSubItems.some(i => location.pathname === i.path);

  const canSeeMaterials = isPro && !isSiteManager && (canViewMaterialsDashboard(currentUser) || canReadMaterials);

  const navItems = clientOnly
    ? [{ path: '/client-portal', label: 'Client Portal', icon: Globe }]
    : [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard, always: true },
        { path: '/client-portal', label: 'Client Portal', icon: Globe, show: canViewClientPortal(currentUser) },
      ].filter((item) => item.always || item.show);

  // Financial group mixes Field (estimates, clients) and Pro (invoices, expenses, cost codes) items.
  const estimationSubItems = (hasField && !isSiteManager && (isHighRole || canReadEstimates || canReadInvoices || canReadExpenses || canReadClients)) ? [
    ...(canReadEstimates ? [{ path: '/estimates', label: 'Estimates', icon: FileText }] : []),
    ...(isPro && canReadInvoices ? [{ path: '/invoices', label: 'Invoices', icon: Receipt }] : []),
    ...(isPro && canReadExpenses ? [{ path: '/expenses', label: 'Expenses', icon: DollarSign }] : []),
    ...(canReadClients ? [{ path: '/clients', label: 'Clients', icon: Building2 }] : []),
    ...(isPro && isHighRole ? [{ path: '/cost-codes', label: 'Cost Codes', icon: Hash }] : []),
  ] : [];
  const isEstimationActive = estimationSubItems.some(i => location.pathname === i.path);

  const settingsItems = [
    { path: '/notification-settings', label: 'Notifications', icon: Bell, always: true },
    { path: '/time-off', label: isHighRole ? 'Time Off Requests' : 'Request Time Off', icon: CalendarOff, always: true, action: isHighRole ? null : () => setShowTimeOff(true) },
    { path: '/reports', label: 'Reports', icon: BarChart2, show: isPro && (isHighRole || canReadReports) },
    { path: '/timecard-report', label: 'Timecard Report', icon: FileText, show: isHighRole },
    { path: '/templates', label: 'Templates', icon: ClipboardList, show: hasField && canManageTemplates(currentUser) },
    { path: '/users', label: 'Users', icon: Users, show: canManageUsers(currentUser) },
    { path: '/qbo-settings', label: 'QBO Integration', icon: Link2, show: isPro && (currentUser?.role === 'owner' || currentUser?.role === 'admin') },
    { path: '/xero-settings', label: 'Xero Integration', icon: Link2, show: isPro && (currentUser?.role === 'owner' || currentUser?.role === 'admin') },
    { path: '/invoice-settings', label: 'Invoice Numbering', icon: Receipt, show: isPro && (currentUser?.role === 'owner' || currentUser?.role === 'admin') },
    { path: '/expense-categories', label: 'Expense Categories', icon: Tags, show: isPro && (currentUser?.role === 'owner' || currentUser?.role === 'admin') },
    { path: '/roles', label: 'Roles', icon: ShieldCheck, show: currentUser?.role === 'owner' || currentUser?.role === 'admin' },
    { path: '/permissions', label: 'Permissions', icon: KeyRound, show: currentUser?.role === 'owner' },
    { label: 'Report an Issue', icon: LifeBuoy, show: isHighRole, action: () => setShowReportIssue(true) },
  ].filter((item) => item.always || item.show);

  const isSettingsActive = settingsItems.some(i => location.pathname === i.path);

  // Desktop-only nav restructure (mobile keeps the original grouping for now):
  // Timecards becomes its own group (with Time Off + Timecard Report), and Reports
  // + Users move up to the main nav, out of Settings.
  const desktopTasksSubItems = tasksSubItems.filter(i => i.path !== '/timecards');
  const isDesktopTasksActive = desktopTasksSubItems.some(i => location.pathname === i.path);
  const timecardsSubItems = [
    { path: '/timecards', label: 'Timecards', icon: Clock },
    ...(isHighRole ? [{ path: '/timecard-report', label: 'Timecard Report', icon: FileText }] : []),
    { path: '/time-off', label: isHighRole ? 'Time Off Requests' : 'Request Time Off', icon: CalendarOff, action: isHighRole ? null : () => setShowTimeOff(true) },
  ];
  const isTimecardsActive = timecardsSubItems.some(i => location.pathname === i.path);
  const desktopMainExtras = [
    { path: '/reports', label: 'Reports', icon: BarChart2, show: isPro && (isHighRole || canReadReports) },
  ].filter(i => i.show);
  const desktopSettingsItems = settingsItems.filter(i => !['/reports', '/users', '/time-off', '/timecard-report', '/admin'].includes(i.path));

  const unreadCount = useUnreadCount();

  // Quick-search command palette (⌘/Ctrl-K, sidebar box, mobile bar). Destinations are filtered to
  // what this user can reach, using the same gates as the nav.
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(o => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const owner = currentUser?.role === 'owner';
  const ownerAdmin = owner || currentUser?.role === 'admin';
  const navDestinations = (clientOnly
    ? [{ label: 'Client Portal', path: '/client-portal', icon: Globe, keywords: ['home', 'portal'] }]
    : [
        { label: 'Dashboard', path: '/', icon: LayoutDashboard, keywords: ['home', 'overview', 'clock in', 'clock out', 'time clock', 'punch'] },
        { label: 'Projects', path: '/projects', icon: ClipboardList, keywords: ['jobs', 'job sites', 'sites'] },
        { label: 'Tasks', path: '/tasks', icon: ListTodo, keywords: ['to do', 'todo'], show: hasField },
        { label: 'Timecards', path: '/timecards', icon: Clock, keywords: ['time', 'hours', 'clock'] },
        { label: 'Daily Goals', path: '/daily-goals', icon: Target, keywords: ['goals'], show: hasField },
        { label: 'Crew Schedule', path: '/crew-schedule', icon: CalendarDays, keywords: ['schedule', 'calendar', 'crew'], show: hasField },
        { label: 'Team Chat', path: '/chat', icon: MessageSquare, keywords: ['chat', 'messages', 'team'], show: hasField },
        { label: 'Materials', path: '/materials', icon: Package, keywords: ['supplies', 'inventory'], show: canSeeMaterials },
        { label: 'Estimates', path: '/estimates', icon: FileText, keywords: ['bids', 'quotes'], show: hasField && !isSiteManager && canReadEstimates },
        { label: 'Invoices', path: '/invoices', icon: Receipt, keywords: ['billing'], show: isPro && !isSiteManager && canReadInvoices },
        { label: 'Expenses', path: '/expenses', icon: DollarSign, keywords: ['receipts', 'costs', 'spending'], show: isPro && !isSiteManager && canReadExpenses },
        { label: 'Clients', path: '/clients', icon: Building2, keywords: ['customers'], show: !isSiteManager && canReadClients },
        { label: 'Subcontractors', path: '/sub-contractors', icon: Users, keywords: ['subs', 'subcontractor'], show: isPro && canReadSubcontractors },
        { label: 'Cost Codes', path: '/cost-codes', icon: Hash, keywords: [], show: isPro && isHighRole },
        { label: 'Reports', path: '/reports', icon: BarChart2, keywords: ['analytics', 'job costing', 'profit'], show: isPro && (isHighRole || canReadReports) },
        { label: 'Client Requests', path: '/client-requests', icon: Inbox, keywords: ['requests'], show: canReviewRequests },
        { label: 'Phase Approvals', path: '/phase-approvals', icon: ShieldCheck, keywords: ['approvals'], show: isHighRole },
        { label: 'Notifications', path: '/notifications', icon: Bell, keywords: ['alerts'] },
        (isHighRole
          ? { label: 'Time Off Requests', path: '/time-off', icon: CalendarOff, keywords: ['vacation', 'pto', 'days off', 'time off'] }
          : { label: 'Request Time Off', action: () => setShowTimeOff(true), icon: CalendarOff, keywords: ['vacation', 'pto', 'days off', 'time off'] }),
        { label: 'Timecard Report', path: '/timecard-report', icon: FileText, keywords: ['payroll', 'hours'], show: isHighRole },
        { label: 'Templates', path: '/templates', icon: ClipboardList, keywords: ['estimate templates'], show: hasField && canManageTemplates(currentUser) },
        { label: 'Users', path: '/users', icon: Users, keywords: ['team', 'staff', 'employees'], show: canManageUsers(currentUser) },
        { label: 'Roles', path: '/roles', icon: ShieldCheck, keywords: ['permissions'], show: ownerAdmin },
        { label: 'Permissions', path: '/permissions', icon: KeyRound, keywords: ['access'], show: owner },
        { label: 'QuickBooks Integration', path: '/qbo-settings', icon: Link2, keywords: ['qbo', 'quickbooks'], show: isPro && ownerAdmin },
        { label: 'Xero Integration', path: '/xero-settings', icon: Link2, keywords: ['xero'], show: isPro && ownerAdmin },
        { label: 'Invoice Numbering', path: '/invoice-settings', icon: Receipt, keywords: ['invoice number'], show: isPro && ownerAdmin },
        { label: 'Expense Categories', path: '/expense-categories', icon: Tags, keywords: [], show: isPro && ownerAdmin },
        { label: 'Settings', path: '/settings', icon: Settings, keywords: ['preferences', 'account'] },
      ]).filter(d => d.show === undefined || d.show);
  // Entity search: projects are deep-linkable (/projects/:id), so include them by name + address.
  const { data: searchProjects = [] } = useQuery({
    queryKey: ['projects-quick-search'],
    queryFn: () => base44.entities.Project.list('-created_date', 500),
    enabled: !clientOnly,
    staleTime: 60000,
  });
  const searchDestinations = clientOnly ? navDestinations : [
    ...navDestinations,
    ...searchProjects.map(p => ({
      label: p.name || 'Untitled project',
      path: `/projects/${p.id}`,
      icon: ClipboardList,
      hint: p.address || p.client_name || undefined,
      keywords: [p.address, p.client_name, 'project', 'job'].filter(Boolean),
    })),
  ];

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-6 border-b border-sidebar-border flex items-center gap-3">
          <img src="/guildwright-iconHD.png" alt="GuildWright" width={44} height={44} className="shrink-0 rounded-lg" />
          <div>
            <h1 style={{ fontFamily: 'var(--font-butler)', fontSize: 17, fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.2 }} className="text-sidebar-foreground">GuildWright</h1>
            <p className="text-xs text-sidebar-foreground/55 mt-0.5" style={{ fontFamily: 'var(--font-highway)' }}>One System. Every Job.</p>
          </div>
        </div>
        <div className="px-3 pt-3">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent/25 text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent/50 text-sm transition-all"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-black/25 border border-white/10">⌘K</kbd>
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50'
                }`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
          {canSeeMaterials && (
            <Link
              to="/materials"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                location.pathname === '/materials' ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50'
              }`}>
              <Package className="w-4 h-4" />
              Materials
            </Link>
          )}
          {!clientOnly && <ProjectsMenu />}
          {!clientOnly && estimationSubItems.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full ${
                  isEstimationActive ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50'
                }`}>
                  <FileText className="w-4 h-4" />
                  Financial
                  <ChevronUp className="w-3 h-3 ml-auto rotate-90" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1" side="right" align="start">
                {estimationSubItems.map(item => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                      }`}>
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}
          {!clientOnly && hasField && (
            <Popover>
              <PopoverTrigger asChild>
                <button className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full ${
                  isDesktopTasksActive ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50'
                }`}>
                  <ListTodo className="w-4 h-4" />
                  Tasks
                  <ChevronUp className="w-3 h-3 ml-auto rotate-90" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1" side="right" align="start">
                {desktopTasksSubItems.map(item => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                      }`}>
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}
          {!clientOnly && (
            <Popover>
              <PopoverTrigger asChild>
                <button className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full ${
                  isTimecardsActive ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50'
                }`}>
                  <Clock className="w-4 h-4" />
                  Timecards
                  <ChevronUp className="w-3 h-3 ml-auto rotate-90" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1" side="right" align="start">
                {timecardsSubItems.map(item => {
                  const isActive = location.pathname === item.path;
                  if (item.action) {
                    return (
                      <button
                        key={item.path}
                        onClick={item.action}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all hover:bg-muted w-full text-left"
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                      }`}>
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}
          {desktopMainExtras.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50'
                }`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <Link
            to="/notifications"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
              location.pathname === '/notifications' ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50'
            }`}>
            <Bell className="w-4 h-4" />
            My Notifications
            {unreadCount > 0 && (
              <span className="ml-auto bg-yellow-400 text-yellow-900 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
          {!clientOnly && (
            <Link
              to="/settings"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                (location.pathname === '/settings' || isSettingsActive) ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50'
              }`}>
              <Settings className="w-4 h-4" />
              Settings
            </Link>
          )}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent/50 transition-all w-full">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent/50 transition-all w-full">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile bottom bar: full-width search strip stacked directly on top of the nav (no overlap) */}
      <div className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 bg-sidebar text-white border-t border-sidebar-border">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-sidebar-border/60 text-sidebar-foreground/60 hover:text-white text-sm"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">Search…</span>
        </button>
        <div className="px-2 py-2 flex items-center justify-around">
        {navItems.map((item) => {
          if (item.path === '/') {
            const isDashActive = location.pathname === '/' || location.pathname === '/notifications';
            return (
              <Popover key={item.path}>
                <PopoverTrigger asChild>
                  <button className={`relative flex flex-col items-center gap-1 p-2 rounded-lg ${
                    isDashActive ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'
                  }`}>
                    <LayoutDashboard className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-[16px] h-[16px] bg-yellow-400 text-yellow-900 rounded-full flex items-center justify-center text-[9px] font-bold px-0.5">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                    <span className="text-xs">Dashboard</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-1 mb-2" align="start" side="top">
                  <Link
                    to="/"
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      location.pathname === '/' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    }`}>
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                  <Link
                    to="/notifications"
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      location.pathname === '/notifications' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    }`}>
                    <Bell className="w-4 h-4" />
                    My Notifications
                    {unreadCount > 0 && (
                      <span className="ml-auto bg-yellow-400 text-yellow-900 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/timecards"
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      location.pathname === '/timecards' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    }`}>
                    <Clock className="w-4 h-4" />
                    Timecards
                  </Link>
                  {canSeeMaterials && (
                    <Link
                      to="/materials"
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        location.pathname === '/materials' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                      }`}>
                      <Package className="w-4 h-4" />
                      Materials
                    </Link>
                  )}
                </PopoverContent>
              </Popover>
            );
          }
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`relative flex flex-col items-center gap-1 p-2 rounded-lg ${
                location.pathname === item.path ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'
              }`}>
              <item.icon className="w-5 h-5" />
              <span className="text-xs">{item.label}</span>
            </Link>
          );
        })}
        {!clientOnly && <ProjectsMenu mobile={true} />}
        {!clientOnly && estimationSubItems.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button className={`flex flex-col items-center gap-1 p-2 rounded-lg ${
                isEstimationActive ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'}`}>
                <FileText className="w-5 h-5" />
                <span className="text-xs">Financial</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1 mb-2" align="center" side="top">
              {estimationSubItems.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    }`}>
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </PopoverContent>
          </Popover>
        )}
        {!clientOnly && hasField && (
          <Popover>
            <PopoverTrigger asChild>
              <button className={`flex flex-col items-center gap-1 p-2 rounded-lg ${
                isTasksActive ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'}`}>
                <ListTodo className="w-5 h-5" />
                <span className="text-xs">Tasks</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1 mb-2" align="center" side="top">
              {tasksSubItems.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    }`}>
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </PopoverContent>
          </Popover>
        )}
        {clientOnly && (
          <button
            onClick={handleLogout}
            className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-sidebar-accent/50 text-white">
            <LogOut className="w-5 h-5" />
            <span className="text-xs">Sign Out</span>
          </button>
        )}
        {!clientOnly && (
          <Link
            to="/settings"
            className={`flex flex-col items-center gap-1 p-2 rounded-lg ${
              (location.pathname === '/settings' || isSettingsActive) ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'}`}>
            <Settings className="w-5 h-5" />
            <span className="text-xs">Settings</span>
          </Link>
        )}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:pt-0 pb-32 md:pb-0">
        {currentUser?.on_trial && (
          <div className="no-print bg-accent/10 border-b border-accent/20 px-4 py-2 text-sm flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
            <span className="text-foreground font-medium">
              {currentUser.trial_days_left} day{currentUser.trial_days_left === 1 ? '' : 's'} left in your free trial
            </span>
            <Link to="/settings" className="text-accent font-semibold hover:underline">Choose a plan</Link>
          </div>
        )}
        <Outlet />
      </main>

      <QuickSearch open={searchOpen} onOpenChange={setSearchOpen} destinations={searchDestinations} />
      <TimeOffRequestDialog open={showTimeOff} onOpenChange={setShowTimeOff} />

      <ReportIssueDialog open={showReportIssue} onOpenChange={setShowReportIssue} />

      {/* Floating Chat Button, hidden on chat page, shifted up/right to avoid nav overlap */}
      {!clientOnly && location.pathname !== '/chat' && (
        <Link
          to="/chat"
          className="no-print fixed z-50 flex items-center gap-2 px-4 py-3 rounded-full font-medium text-sm transition-all hover:scale-105 active:scale-95 text-[#F5F2EA]"
          style={{
            background: '#262525',
            boxShadow: '0 4px 20px rgba(38,37,37,0.35)',
            bottom: 'calc(72px + 25px)',
            right: '16px',
            fontFamily: 'var(--font-highway)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#3a3838'}
          onMouseLeave={e => e.currentTarget.style.background = '#262525'}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="hidden sm:inline">Team Chat</span>
        </Link>
      )}
    </div>
  );
}