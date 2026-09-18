import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { useToast } from '@/components/ui/use-toast';
import { Lock, Loader2 } from 'lucide-react';
import BillingIntervalToggle from '@/components/shared/BillingIntervalToggle';
import { priceLabel } from '@/lib/pricing';
import { isNativePlatform } from '@/lib/push';

const BILLING_ROLES = ['owner', 'admin', 'coo'];

// Wraps a tier-gated page. Tenants without the required tier see an upgrade prompt.
// tier: 'field' | 'pro'. (The database also blocks the underlying data, so this is the front door.)
export default function ProGate({ children, feature = 'This feature', tier = 'pro' }) {
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();
  const [loading, setLoading] = useState('');
  const [billingInterval, setBillingInterval] = useState('month');

  // Only block once we positively know the tenant lacks the tier. While loading (fields undefined),
  // render the page so entitled tenants never see a flash of the gate.
  const blocked = tier === 'pro' ? currentUser?.is_pro === false : currentUser?.has_field === false;
  if (!blocked) return children;

  const canBill = BILLING_ROLES.includes(currentUser?.role);

  const upgrade = async (plan) => {
    setLoading(plan);
    const res = await base44.functions.invoke('stripeBilling', { action: 'create_checkout', plan, interval: billingInterval });
    if (res.data?.url) { window.location.href = res.data.url; return; }
    setLoading('');
    toast({ title: 'Could not start checkout', description: res.data?.error || 'Please try again.', variant: 'destructive' });
  };

  // A Field feature offers the cheaper Field plan first (with Pro as the everything option); a Pro
  // feature only offers Pro.
  const planLabel = tier === 'field' ? 'Field or Pro' : 'Pro';

  return (
    <div className="p-8 max-w-lg mx-auto text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center mb-4">
        <Lock className="w-7 h-7 text-accent" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">{feature} needs {planLabel}</h1>
      <p className="text-sm text-muted-foreground mt-2">
        {tier === 'field'
          ? 'Upgrade to Field to unlock estimates, the client directory, tasks, scheduling, and team chat. Pro adds invoicing, expenses, materials, and QuickBooks.'
          : 'Upgrade to Pro to unlock invoicing, change orders, subcontractors, expenses, materials, cost codes, and QuickBooks.'}
      </p>
      {canBill && isNativePlatform() ? (
        <p className="text-sm text-muted-foreground mt-5">
          Plans are managed on the web. Open app.guildwright.app in a browser to upgrade.
        </p>
      ) : canBill ? (
        <div className="mt-5 flex flex-col items-center gap-3">
          <BillingIntervalToggle value={billingInterval} onChange={setBillingInterval} disabled={!!loading} />
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {tier === 'field' && (
            <button
              onClick={() => upgrade('field')}
              disabled={!!loading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              {loading === 'field' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Upgrade to Field ({priceLabel('field', billingInterval)})
            </button>
          )}
          <button
            onClick={() => upgrade('pro')}
            disabled={!!loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 disabled:opacity-60"
          >
            {loading === 'pro' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {tier === 'field' ? 'Get Pro' : 'Upgrade to Pro'} ({priceLabel('pro', billingInterval)})
          </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mt-5">Ask your account owner to upgrade the plan.</p>
      )}
    </div>
  );
}
