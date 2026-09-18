// Public bid-submission backend for the /submit-bid page (subcontractors are not logged in, so this
// runs with the service role and gates on the sub being invited to the request). The page was
// calling a function that never existed, so the whole flow was dead. Deploy with --no-verify-jwt.
//
// Actions (POST JSON { mode, bidRequestId, subId|subContractorId, ... }):
//   get_bid_data      -> { bidRequest (sanitized), sub, existingBid }
//   submit_bid        -> record/update the sub's bid (status 'submitted')
//   approve_estimate  -> accept a predetermined estimate + start date (status 'approved')
//   confirm_schedule  -> set the agreed start/end dates
//   decline_estimate  -> decline (status 'declined')
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const { mode } = body;
  const bidRequestId = body.bidRequestId;
  const sid = body.subContractorId || body.subId;
  if (!bidRequestId || !sid) return json({ error: 'This link is missing its bid request or contractor.' }, { status: 400 });

  // Load the request and confirm this contractor was actually invited (the link's authorization).
  const { data: br } = await admin.from('bid_requests').select('*').eq('id', bidRequestId).maybeSingle();
  if (!br) return json({ error: 'That bid request could not be found.' }, { status: 404 });
  const invited = (br.sub_contractor_ids || []).map(String).includes(String(sid));
  if (!invited) return json({ error: 'This link is not valid for this contractor.' }, { status: 403 });

  const { data: sub } = await admin.from('sub_contractors').select('id, name, contact_name, email').eq('id', sid).maybeSingle();

  const findExisting = async () =>
    (await admin.from('bid_submissions').select('*').eq('bid_request_id', bidRequestId).eq('sub_contractor_id', sid).maybeSingle()).data;

  // Notify the tenant's managers (owner + site_manager) in-app. Each inserted notification row
  // fans out a web/native push via the notifications trigger, so no email is sent.
  const subName = sub?.name || sub?.contact_name || 'A subcontractor';
  const notifyManagers = async (title: string, message: string) => {
    const { data: mgrs } = await admin
      .from('user_profiles')
      .select('user_id')
      .eq('company_id', br.company_id)
      .in('role', ['owner', 'site_manager']);
    const rows = (mgrs || [])
      .map((m) => m.user_id)
      .filter(Boolean)
      .map((uid) => ({
        company_id: br.company_id,
        user_id: uid,
        type: 'bid',
        title,
        message,
        project_name: br.project_name || null,
      }));
    if (rows.length) await admin.from('notifications').insert(rows);
  };

  // Save (or update) this sub's single submission. company_id must be set explicitly (service role
  // has no auth_company_id() default).
  // deno-lint-ignore no-explicit-any
  const upsert = async (fields: Record<string, any>) => {
    const existing = await findExisting();
    const payload = {
      bid_request_id: bidRequestId,
      sub_contractor_id: sid,
      sub_contractor_name: sub?.name || sub?.contact_name || '',
      sub_contractor_email: sub?.email || '',
      company_id: br.company_id,
      ...fields,
    };
    if (existing) { await admin.from('bid_submissions').update(payload).eq('id', existing.id); return existing.id; }
    const { data } = await admin.from('bid_submissions').insert(payload).select('id').single();
    return data?.id;
  };

  if (mode === 'get_bid_data') {
    const existingBid = await findExisting();
    const bidRequest = {
      id: br.id, title: br.title, project_name: br.project_name, project_address: br.project_address,
      description: br.description, budget: br.budget, scope_of_work: br.scope_of_work, photo_urls: br.photo_urls,
      eta_window_start: br.eta_window_start, eta_window_end: br.eta_window_end, is_estimate: br.is_estimate, status: br.status,
    };
    return json({ bidRequest, sub: sub ? { id: sub.id, name: sub.name, contact_name: sub.contact_name } : null, existingBid });
  }

  if (mode === 'submit_bid') {
    await upsert({
      bid_amount: body.bidAmount ?? null,
      estimated_start_date: body.estimatedStartDate || null,
      estimated_end_date: body.estimatedEndDate || null,
      notes: body.notes || null,
      status: 'submitted',
    });
    await admin.from('bid_requests').update({ status: 'reviewing' }).eq('id', bidRequestId).eq('status', 'sent');
    const amt = body.bidAmount != null ? ` for $${Number(body.bidAmount).toLocaleString()}` : '';
    await notifyManagers('New bid submitted', `${subName} submitted a bid${amt} on "${br.title || br.project_name || 'a bid request'}".`);
    return json({ ok: true });
  }

  if (mode === 'approve_estimate') {
    await upsert({
      bid_amount: br.budget ?? null,
      estimated_start_date: body.estimatedStartDate || null,
      estimated_end_date: body.estimatedEndDate || body.estimatedStartDate || null,
      notes: body.notes || null,
      status: 'approved',
    });
    await admin.from('bid_requests').update({ status: 'awarded' }).eq('id', bidRequestId);
    await notifyManagers('Estimate accepted', `${subName} accepted the estimate on "${br.title || br.project_name || 'a bid request'}".`);
    return json({ ok: true });
  }

  if (mode === 'confirm_schedule') {
    await upsert({
      estimated_start_date: body.estimatedStartDate || null,
      estimated_end_date: body.estimatedEndDate || null,
      notes: body.notes || null,
    });
    await notifyManagers('Schedule confirmed', `${subName} confirmed their schedule on "${br.title || br.project_name || 'a bid request'}".`);
    return json({ ok: true });
  }

  if (mode === 'decline_estimate' || mode === 'decline_bid') {
    await upsert({ status: 'declined', notes: body.reason || body.notes || null });
    await notifyManagers('Bid declined', `${subName} declined "${br.title || br.project_name || 'a bid request'}".`);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
});
