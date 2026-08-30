import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentUser } from '@/lib/UserContext';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { useFeaturePermission } from '@/lib/usePermissions';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Bell, Receipt, Link2, Hash, ClipboardList, Tags, Users, KeyRound, ShieldCheck, Settings as SettingsIcon, LifeBuoy, CreditCard, Loader2, CheckCircle2, BookOpen, BarChart2, FileText, CalendarOff, Moon, Sun, LogOut } from 'lucide-react';
import ReportIssueDialog from '@/components/layout/ReportIssueButton';
import TimeOffRequestDialog from '@/components/time-off/TimeOffRequestDialog';
import ExampleDataCard from '@/components/onboarding/ExampleDataCard';
import BillingIntervalToggle from '@/components/shared/BillingIntervalToggle';
import { priceLabel, annualSaving } from '@/lib/pricing';

const MODULES = [
  {
    title: 'General',
    items: [
      { path: '/notification-settings', label: 'Notifications', icon: Bell, desc: 'Alerts and push notification settings' },
    ],
  },
  {
    title: 'Estimates & Invoices',
    items: [
      { path: '/invoice-settings', label: 'Invoices & Estimates', icon: Receipt, desc: 'Invoice numbering, plus estimate payment schedule & terms', roles: ['owner', 'admin'] },
      { path: '/qbo-settings', label: 'QuickBooks', icon: Link2, desc: 'Connect QBO and map cost codes to items', roles: ['owner', 'admin'] },
      { path: '/xero-settings', label: 'Xero', icon: Link2, desc: 'Connect Xero and map accounts', roles: ['owner', 'admin'] },
      { path: '/cost-codes', label: 'Cost Codes', icon: Hash, desc: 'Cost codes for estimates and expenses', roles: ['owner', 'coo', 'admin'] },
      { path: '/templates', label: 'Templates', icon: ClipboardList, desc: 'Estimate and task templates' },
    ],
  },
  {
    title: 'Expenses',
    items: [
      { path: '/expense-categories', label: 'Expense Categories', icon: Tags, desc: 'Categories crew pick when logging expenses', roles: ['owner', 'admin'] },
    ],
  },
  {
    title: 'Team',
    items: [
      { path: '/users', label: 'Users & Wages', icon: Users, desc: 'Crew accounts, roles, and hourly wages', roles: ['owner', 'coo', 'admin'] },
      // Gusto direct sync is built and demo-validated but hidden until Gusto grants production access
      // (their pre-approval favors more-established companies). Tenants use the Gusto CSV export from
      // the Timecard Report in the meantime. Re-enable this card + flip GUSTO_ENV=production to ship.
      // { path: '/gusto-settings', label: 'Gusto Payroll', icon: Link2, desc: 'Connect Gusto and push hours from timecards', roles: ['owner', 'admin'] },
      { path: '/roles', label: 'Roles', icon: ShieldCheck, desc: 'Name your roles and set their permission level', roles: ['owner', 'admin'] },
      { path: '/permissions', label: 'Permissions', icon: KeyRound, desc: 'What each role can see and do', roles: ['owner'] },
    ],
  },
];

const HIGH_ROLES = ['owner', 'coo', 'admin'];

export default function SettingsHub() {
  const { currentUser, refreshUser } = useCurrentUser();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { canRead: canReadReports } = useFeaturePermission('reports');
  const { toast } = useToast();
  const role = currentUser?.role;
  const allowed = (item) => !item.roles || item.roles.includes(role);
  const [showReportIssue, setShowReportIssue] = useState(false);
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingInterval, setBillingInterval] = useState('month');
  const isHighRole = HIGH_ROLES.includes(role);

  // These live in the desktop sidebar; on mobile they have no other home, so the settings hub
  // carries them. Unknown tier (still loading) counts as entitled to avoid nav flicker.
  const proNav = currentUser?.is_pro !== false;
  const mobileNavItems = [
    (proNav && (isHighRole || canReadReports)) && { path: '/reports', label: 'Reports', icon: BarChart2, desc: 'Job costing, hours, and financial reports' },
    isHighRole && { path: '/timecard-report', label: 'Timecard Report', icon: FileText, desc: 'Approved hours and payroll export' },
    isHighRole
      ? { path: '/time-off', label: 'Time Off Requests', icon: CalendarOff, desc: 'Review and approve crew time off' }
      : { action: () => setShowTimeOff(true), label: 'Request Time Off', icon: CalendarOff, desc: 'Request days off' },
  ].filter(Boolean);
  const isPro = currentUser?.is_pro === true;
  const hasField = currentUser?.has_field === true;
  const onTrial = currentUser?.on_trial === true;
  const [params, setParams] = useSearchParams();

  // Returning from Stripe Checkout: confirm and refresh the plan (the webhook may take a moment).
  useEffect(() => {
    const billing = params.get('billing');
    if (!billing) return;
    if (billing === 'success') {
      toast({ title: 'Subscription active', description: 'Welcome to Pro. It may take a few seconds to unlock everything.' });
      setTimeout(() => refreshUser?.(), 2500);
    } else if (billing === 'cancelled') {
      toast({ title: 'Checkout cancelled' });
    }
    params.delete('billing');
    setParams(params, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startBilling = async (action, plan) => {
    setBillingLoading(true);
    const res = await base44.functions.invoke('stripeBilling', { action, plan, interval: billingInterval });
    if (res.data?.url) { window.location.href = res.data.url; return; }
    setBillingLoading(false);
    toast({ title: 'Billing unavailable', description: res.data?.error || 'Please try again.', variant: 'destructive' });
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
          <SettingsIcon className="w-7 h-7" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Configure how GuildWright works for your company.</p>
      </div>

      {MODULES.map(mod => {
        const items = mod.items.filter(allowed);
        if (!items.length) return null;
        return (
          <div key={mod.title}>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{mod.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:border-accent hover:shadow-sm transition-all"
                >
                  <div className="mt-0.5 rounded-lg bg-accent/15 p-2 text-accent shrink-0"><item.icon className="w-5 h-5" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {/* Mobile only: items that live in the desktop sidebar and would otherwise be unreachable. */}
      <div className="md:hidden">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Reports &amp; Time</h2>
        <div className="grid grid-cols-1 gap-3">
          {mobileNavItems.map(item => {
            const cls = 'flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:border-accent hover:shadow-sm transition-all';
            const inner = (
              <>
                <div className="mt-0.5 rounded-lg bg-accent/15 p-2 text-accent shrink-0"><item.icon className="w-5 h-5" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </>
            );
            return item.action ? (
              <button key={item.label} onClick={item.action} className={`${cls} text-left w-full`}>{inner}</button>
            ) : (
              <Link key={item.path} to={item.path} className={cls}>{inner}</Link>
            );
          })}
        </div>
      </div>

      <ExampleDataCard />

      {isHighRole && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Billing</h2>
          <div className="flex flex-col gap-3 p-4 rounded-lg border border-border bg-card">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-accent/15 p-2 text-accent shrink-0"><CreditCard className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  {isPro ? <>Pro plan <CheckCircle2 className="w-4 h-4 text-emerald-500" /></>
                    : hasField ? 'Field plan'
                    : onTrial ? `Free trial, ${currentUser?.trial_days_left} day${currentUser?.trial_days_left === 1 ? '' : 's'} left`
                    : 'No active plan'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isPro ? 'Full access. Manage your subscription, payment method, and invoices.'
                    : hasField ? 'Field includes estimates, clients, scheduling, tasks, and chat. Upgrade to Pro for invoicing, expenses, materials, and QuickBooks.'
                    : onTrial ? 'You have full access during the trial. Pick a plan to keep it going.'
                    : 'Subscribe to unlock the app. Field for estimating and scheduling; Pro adds invoicing and QuickBooks.'}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2 sm:justify-end">
              {isPro ? (
                <button onClick={() => startBilling('create_portal')} disabled={billingLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-muted disabled:opacity-60">
                  {billingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Manage billing
                </button>
              ) : (
                <>
                  <BillingIntervalToggle value={billingInterval} onChange={setBillingInterval} disabled={billingLoading} />
                  {billingInterval === 'year' && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 self-center">
                      Saves ${annualSaving(hasField ? 'pro' : 'field')} a year versus monthly.
                    </p>
                  )}
                  {!hasField && (
                    <button onClick={() => startBilling('create_checkout', 'field')} disabled={billingLoading}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-muted disabled:opacity-60">
                      {billingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Choose Field ({priceLabel('field', billingInterval)})
                    </button>
                  )}
                  <button onClick={() => startBilling('create_checkout', 'pro')} disabled={billingLoading}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60">
                    {billingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {hasField ? 'Upgrade to Pro' : 'Choose Pro'} ({priceLabel('pro', billingInterval)})
                  </button>
                  {hasField && (
                    <button onClick={() => startBilling('create_portal')} disabled={billingLoading}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-muted disabled:opacity-60">
                      Manage billing
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isHighRole && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Support</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="https://guildwright.app/help"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:border-accent hover:shadow-sm transition-all text-left"
            >
              <div className="mt-0.5 rounded-lg bg-accent/15 p-2 text-accent shrink-0"><BookOpen className="w-5 h-5" /></div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Help &amp; Guides</p>
                <p className="text-xs text-muted-foreground mt-0.5">How-to articles and answers, from setup to invoicing</p>
              </div>
            </a>
            <button
              type="button"
              onClick={() => setShowReportIssue(true)}
              className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:border-accent hover:shadow-sm transition-all text-left"
            >
              <div className="mt-0.5 rounded-lg bg-accent/15 p-2 text-accent shrink-0"><LifeBuoy className="w-5 h-5" /></div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Report an Issue</p>
                <p className="text-xs text-muted-foreground mt-0.5">Report a bug, ask a question, or send a suggestion to support</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Mobile only: account actions that live in the desktop sidebar. */}
      <div className="md:hidden">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Account</h2>
        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:border-accent transition-all text-left"
          >
            <div className="rounded-lg bg-accent/15 p-2 text-accent shrink-0">{theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</div>
            <p className="text-sm font-semibold text-foreground">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</p>
          </button>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:border-destructive/50 transition-all text-left"
          >
            <div className="rounded-lg bg-destructive/10 p-2 text-destructive shrink-0"><LogOut className="w-5 h-5" /></div>
            <p className="text-sm font-semibold text-destructive">Sign Out</p>
          </button>
        </div>
      </div>

      <ReportIssueDialog open={showReportIssue} onOpenChange={setShowReportIssue} />
      <TimeOffRequestDialog open={showTimeOff} onOpenChange={setShowTimeOff} />
    </div>
  );
}
