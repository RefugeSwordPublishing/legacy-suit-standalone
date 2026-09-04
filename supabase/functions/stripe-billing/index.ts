// Tenant-facing Stripe billing: start a Pro subscription (Checkout) and manage an existing one
// (Billing Portal). The webhook (stripe-webhook) is what actually flips companies.plan; this just
// gets the tenant to Stripe and back. Auth: the caller's JWT must map to a membership, and only
// owner/admin/coo can manage billing.
//
// Required secrets: STRIPE_SECRET_KEY, APP_PUBLIC_URL, and a price id per plan and interval:
// STRIPE_FIELD_PRICE_ID, STRIPE_PRO_PRICE_ID, STRIPE_FIELD_ANNUAL_PRICE_ID, STRIPE_PRO_ANNUAL_PRICE_ID.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@16?target=deno';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const PRICES: Record<string, string> = {
  field_month: Deno.env.get('STRIPE_FIELD_PRICE_ID') ?? '',
  pro_month: Deno.env.get('STRIPE_PRO_PRICE_ID') ?? '',
  field_year: Deno.env.get('STRIPE_FIELD_ANNUAL_PRICE_ID') ?? '',
  pro_year: Deno.env.get('STRIPE_PRO_ANNUAL_PRICE_ID') ?? '',
};
const APP_URL = Deno.env.get('APP_PUBLIC_URL') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (d: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(d), { ...init, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
    const { data: mem } = await admin.from('memberships').select('company_id, role').eq('user_id', user.id).single();
    if (!mem) return json({ error: 'No company' }, { status: 403 });
    if (!['owner', 'admin', 'coo'].includes(mem.role)) return json({ error: 'Only an owner or admin can manage billing.' }, { status: 403 });
    const companyId = mem.company_id;

    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const { data: company } = await admin.from('companies').select('id, name, plan, stripe_customer_id').eq('id', companyId).maybeSingle();
    if (!company) return json({ error: 'Company not found' }, { status: 404 });

    if (action === 'create_checkout') {
      const wantPlan = body.plan === 'field' ? 'field' : 'pro';
      // Annual is opt-in per checkout; anything but an explicit 'year' stays monthly so an older
      // client that knows nothing about intervals keeps buying what it always did.
      const wantInterval = body.interval === 'year' ? 'year' : 'month';
      const price = PRICES[`${wantPlan}_${wantInterval}`];
      if (!price) {
        return json({ error: `${wantInterval === 'year' ? 'Annual' : 'Monthly'} billing is not configured yet (missing ${wantPlan} price).` }, { status: 400 });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price, quantity: 1 }],
        client_reference_id: companyId,
        subscription_data: { metadata: { company_id: companyId } },
        // Reuse the stored customer so we don't create duplicates; else let Stripe make one and
        // prefill the buyer's email. The webhook stores the resulting customer id.
        ...(company.stripe_customer_id ? { customer: company.stripe_customer_id } : { customer_email: user.email }),
        success_url: `${APP_URL}/settings?billing=success`,
        cancel_url: `${APP_URL}/settings?billing=cancelled`,
        allow_promotion_codes: true,
      });
      return json({ url: session.url });
    }

    if (action === 'create_portal') {
      if (!company.stripe_customer_id) return json({ error: 'No billing account yet. Subscribe first.' }, { status: 400 });
      const portal = await stripe.billingPortal.sessions.create({
        customer: company.stripe_customer_id,
        return_url: `${APP_URL}/settings`,
      });
      return json({ url: portal.url });
    }

    return json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
});
