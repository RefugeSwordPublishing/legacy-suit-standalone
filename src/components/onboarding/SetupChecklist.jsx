import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase, base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { CheckCircle2, Circle, ArrowRight, X, Rocket, ChevronDown } from 'lucide-react';

const MGMT = ['owner', 'admin', 'coo'];

// A data-driven first-run checklist. Each step is marked done from real tenant data, carries a short
// explainer of why it matters, and links to the page to do it. Pro-only steps are hidden on Field.
// Owners can dismiss it; it also hides automatically once every required step is done.
export default function SetupChecklist() {
  const { currentUser } = useCurrentUser();
  const isMgmt = MGMT.includes(currentUser?.role);
  const isPro = currentUser?.is_pro === true;
  const [collapsed, setCollapsed] = useState(false);
  const [dismissedLocal, setDismissedLocal] = useState(false);

  const settingsQ = useQuery({
    queryKey: ['onboarding-settings'],
    enabled: isMgmt,
    queryFn: async () => {
      const { data } = await supabase.from('company_settings')
        .select('company_id, company_name, email, phone, logo_url, onboarding_dismissed').maybeSingle();
      return data || null;
    },
  });
  const settings = settingsQ.data;
  const profilesQ = useQuery({ queryKey: ['user-profiles'], enabled: isMgmt, queryFn: () => base44.entities.UserProfile.list() });
  const projectsQ = useQuery({ queryKey: ['projects'], enabled: isMgmt, queryFn: () => base44.entities.Project.list() });
  const estimatesQ = useQuery({ queryKey: ['estimates'], enabled: isMgmt, queryFn: () => base44.entities.Estimate.list() });
  const costCodesQ = useQuery({ queryKey: ['cost-codes'], enabled: isMgmt && isPro, queryFn: () => base44.entities.CostCode.list() });
  const categoriesQ = useQuery({ queryKey: ['expense-categories'], enabled: isMgmt && isPro, queryFn: () => base44.entities.ExpenseCategory.list() });
  const profiles = profilesQ.data || [];
  const projects = projectsQ.data || [];
  const estimates = estimatesQ.data || [];
  const costCodes = costCodesQ.data || [];
  const categories = categoriesQ.data || [];
  const { data: acctConnected } = useQuery({
    queryKey: ['onboarding-acct'],
    enabled: isMgmt && isPro,
    queryFn: async () => {
      const [qbo, xero] = await Promise.all([
        supabase.from('qbo_integration_settings').select('is_connected').maybeSingle(),
        supabase.from('xero_integration_settings').select('is_connected').maybeSingle(),
      ]);
      return !!(qbo.data?.is_connected || xero.data?.is_connected);
    },
  });

  const steps = useMemo(() => {
    const list = [
      {
        key: 'profile', label: 'Complete your company profile',
        why: 'Your name, contact, and address print on every estimate and invoice the client sees.',
        to: '/settings', done: !!(settings?.company_name && (settings?.email || settings?.phone)),
      },
      {
        key: 'crew', label: 'Invite your crew',
        why: 'Team members get clock-in, tasks, and schedules. Set each person’s role and wage.',
        to: '/users', done: profiles.filter(p => p.is_active !== false).length > 1,
      },
    ];
    if (isPro) list.push({
      key: 'costcodes', label: 'Add your cost codes',
      why: 'Cost codes are the buckets you estimate and track against (for example Framing, Electrical, Demo). They organize estimates and map your invoice lines to the right QuickBooks or Xero account.',
      to: '/cost-codes', done: costCodes.length > 0,
    });
    if (isPro) list.push({
      key: 'categories', label: 'Set up expense categories',
      why: 'The buckets your crew picks from when logging a receipt, so job costs land in the right place.',
      to: '/expense-categories', done: categories.length > 0,
    });
    list.push({
      key: 'project', label: 'Create your first project',
      why: 'Projects tie together estimates, schedules, time, expenses, and invoices for one job.',
      to: '/projects', done: projects.length > 0,
    });
    list.push({
      key: 'estimate', label: 'Build your first estimate',
      why: 'Send a branded estimate a client can approve and sign online, then bill against it.',
      to: '/estimates', done: estimates.length > 0,
    });
    if (isPro) list.push({
      key: 'accounting', label: 'Connect your accounting', optional: true,
      why: 'Link QuickBooks or Xero so invoices push straight to your books. Optional, set it up when you are ready.',
      to: '/settings', done: acctConnected === true,
    });
    return list;
  }, [settings, profiles, projects, estimates, costCodes, categories, acctConnected, isPro]);

  const required = steps.filter(s => !s.optional);
  const doneCount = steps.filter(s => s.done).length;
  const allRequiredDone = required.every(s => s.done);

  // "Ready" = every query that feeds a step has actually loaded. Until then we don't render, which
  // prevents the flash on every open (it used to show all-incomplete, then hide as data arrived)
  // and keeps it hidden offline (failed queries never reach success).
  const coreQueries = isPro
    ? [settingsQ, profilesQ, projectsQ, estimatesQ, costCodesQ, categoriesQ]
    : [settingsQ, profilesQ, projectsQ, estimatesQ];
  const ready = coreQueries.every(q => q.isSuccess);

  // Once every required step is done, persist it so the checklist is permanently complete and never
  // flashes back on later opens (covers "completes it" as well as an explicit dismiss).
  useEffect(() => {
    if (ready && allRequiredDone && settings?.company_id && !settings.onboarding_dismissed && !dismissedLocal) {
      supabase.from('company_settings')
        .upsert({ company_id: settings.company_id, onboarding_dismissed: true }, { onConflict: 'company_id' })
        .then(() => {}, () => {});
    }
  }, [ready, allRequiredDone, settings?.company_id, settings?.onboarding_dismissed, dismissedLocal]);

  const dismiss = async () => {
    setDismissedLocal(true);
    if (settings?.company_id) {
      await supabase.from('company_settings').upsert({ company_id: settings.company_id, onboarding_dismissed: true }, { onConflict: 'company_id' });
    }
  };

  // Hide for non-management. Wait until the data truly loaded before deciding, then hide when
  // dismissed (stored or this session) or once everything required is done.
  if (!isMgmt || !ready) return null;
  if (dismissedLocal || settings?.onboarding_dismissed || allRequiredDone) return null;

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 overflow-hidden mb-6">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="rounded-lg bg-accent/15 p-2 text-accent shrink-0"><Rocket className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Finish setting up GuildWright</p>
          <p className="text-xs text-muted-foreground">{doneCount} of {steps.length} done. A few steps to get your crew running.</p>
        </div>
        <button onClick={() => setCollapsed(c => !c)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Toggle">
          <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
        <button onClick={dismiss} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Dismiss setup checklist"><X className="w-4 h-4" /></button>
      </div>

      <div className="px-4">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} />
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 pt-4 space-y-1.5">
          {steps.map(s => (
            <Link key={s.key} to={s.to}
              className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${s.done ? 'opacity-60' : 'hover:bg-accent/10'}`}>
              {s.done
                ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                : <Circle className="w-5 h-5 text-muted-foreground/50 shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${s.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {s.label}{s.optional && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground font-normal">optional</span>}
                </p>
                {!s.done && <p className="text-xs text-muted-foreground mt-0.5">{s.why}</p>}
              </div>
              {!s.done && <ArrowRight className="w-4 h-4 text-accent shrink-0 mt-0.5" />}
            </Link>
          ))}
          <p className="text-xs text-muted-foreground px-3 pt-1">
            Want to look around first? <Link to="/settings" className="text-accent hover:underline">Load example data</Link> in Settings to explore a sample estimate, then remove it anytime.
          </p>
        </div>
      )}
    </div>
  );
}
