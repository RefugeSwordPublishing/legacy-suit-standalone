// Stripe webhook: the billing sync side of the Field/Pro paywall. Stripe calls this endpoint on
// subscription lifecycle events; we translate them into companies.plan + subscription_status so the
// DB paywall (company_is_pro()) flips automatically. No auth header from Stripe, so deploy with
// --no-verify-jwt; the Stripe signature is what authenticates the call.
//
// Required secrets (supabase secrets set ...):
//   STRIPE_SECRET_KEY       - sk_live_... / sk_test_...
//   STRIPE_WEBHOOK_SECRET   - whsec_... (from the Stripe webhook endpoint config)
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
//
// The tenant is matched by companies.stripe_customer_id; on the first checkout we also accept a
// company_id passed through Checkout's client_reference_id / subscription metadata and store the
// customer id so later events resolve cleanly.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@16?target=deno';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const PRO_PRICE = Deno.env.get('STRIPE_PRO_PRICE_ID') ?? '';
const FIELD_PRICE = Deno.env.get('STRIPE_FIELD_PRICE_ID') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

// Which tier a subscription grants is determined by its price, not its status. The status
// (active/trialing/past_due vs canceled/unpaid) is stored separately and gates access in
// company_access_level(): active/trialing/past_due honor the plan, everything else drops to the
// free floor (past_due keeps access as a grace window).
function planForSubscription(sub: Stripe.Subscription): 'pro' | 'field' {
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (priceId && priceId === FIELD_PRICE) return 'field';
  return 'pro'; // PRO_PRICE or unknown -> treat as pro
}

async function applySubscription(sub: Stripe.Subscription, companyIdHint?: string | null) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const plan = planForSubscription(sub);

  // Resolve the tenant: prefer an explicit company_id (first checkout), else the stored customer id.
  let companyId = companyIdHint || (sub.metadata?.company_id ?? null);
  if (!companyId && customerId) {
    const { data } = await admin.from('companies').select('id').eq('stripe_customer_id', customerId).maybeSingle();
    companyId = data?.id ?? null;
  }
  if (!companyId) {
    console.warn('stripe-webhook: no company matched for customer', customerId);
    return;
  }

  await admin.from('companies').update({
    plan,
    subscription_status: sub.status,
    stripe_customer_id: customerId ?? null,
    stripe_subscription_id: sub.id,
  }).eq('id', companyId);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.client_reference_id || session.metadata?.company_id || null;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await applySubscription(sub, companyId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Ignore other events.
        break;
    }
  } catch (err) {
    console.error('stripe-webhook handler error', err);
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
