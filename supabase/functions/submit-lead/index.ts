// Public lead capture. The marketing site's trial/contact form POSTs here so every request lands in
// the platform CRM (leads table) in addition to the notification email. No JWT (public), inserts via
// the service role. Deploy with --no-verify-jwt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (d: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(d), { ...init, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => ({}));
    const name = (body.name ?? '').toString().slice(0, 200).trim();
    const company = (body.company ?? '').toString().slice(0, 200).trim();
    const email = (body.email ?? '').toString().slice(0, 200).trim();
    const phone = (body.phone ?? '').toString().slice(0, 60).trim();
    const message = (body.message ?? '').toString().slice(0, 4000).trim();
    const source = (body.source ?? 'trial_form').toString().slice(0, 60).trim();

    // Require at least an email or a name+company so we can follow up.
    if (!email && !(name || company)) return json({ error: 'Missing contact info' }, { status: 400 });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { error } = await admin.from('leads').insert({ name, company, email, phone, message, source });
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
});
