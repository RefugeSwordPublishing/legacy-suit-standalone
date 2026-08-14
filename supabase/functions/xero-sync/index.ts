// Xero sync: list revenue accounts + items for mapping, and push an invoice. Mirrors quickbooks-sync
// (same SOV/PTD + category-mapping line logic) but builds Xero invoices: lines carry an AccountCode
// + TaxType, the project goes on a Tracking Category (not a sub-customer), and tokens refresh every
// ~30 min with a rotating refresh token.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CLIENT_ID = Deno.env.get('XERO_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET') ?? '';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const API = 'https://api.xero.com/api.xro/2.0';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// deno-lint-ignore no-explicit-any
async function refreshToken(admin: any, s: any) {
  const creds = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refresh_token }),
  });
  const t = await res.json();
  if (!t.access_token) throw new Error('Failed to refresh Xero token');
  const expiresAt = new Date(Date.now() + (t.expires_in ?? 1800) * 1000).toISOString();
  // Xero rotates the refresh token: store the new one.
  await admin.from('xero_integration_settings').update({
    access_token: t.access_token, refresh_token: t.refresh_token || s.refresh_token, token_expires_at: expiresAt,
  }).eq('id', s.id);
  return t.access_token as string;
}
// deno-lint-ignore no-explicit-any
async function validToken(admin: any, s: any) {
  if (!s.token_expires_at || new Date(s.token_expires_at) <= new Date(Date.now() + 120000)) return await refreshToken(admin, s);
  return s.access_token as string;
}
async function xero(method: string, path: string, token: string, tenantId: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Xero-tenant-id': tenantId, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (d: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(d), { ...init, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
    const { data: mem } = await admin.from('memberships').select('company_id').eq('user_id', user.id).single();
    if (!mem) return json({ error: 'No company' }, { status: 403 });
    const companyId = mem.company_id;

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const { data: settings } = await admin.from('xero_integration_settings').select('*').eq('company_id', companyId).maybeSingle();
    if (!settings?.is_connected) return json({ error: 'Xero is not connected' }, { status: 400 });
    if (!settings.tenant_id) return json({ error: 'No Xero organization selected' }, { status: 400 });

    let token: string;
    try { token = await validToken(admin, settings); }
    catch (err) { return json({ error: 'Failed to refresh Xero token', details: (err as Error).message }, { status: 401 }); }
    const tenantId = settings.tenant_id;

    if (action === 'list_accounts') {
      const where = encodeURIComponent('Class=="REVENUE" AND Status=="ACTIVE"');
      const r = await xero('GET', `/Accounts?where=${where}`, token, tenantId);
      // deno-lint-ignore no-explicit-any
      return json({ accounts: (r.Accounts ?? []).map((a: any) => ({ Code: a.Code, Name: a.Name })) });
    }

    if (action === 'list_items') {
      const r = await xero('GET', `/Items`, token, tenantId);
      // deno-lint-ignore no-explicit-any
      return json({ items: (r.Items ?? []).map((i: any) => ({ Code: i.Code, Name: i.Name })) });
    }

    // Job tracking: Xero has no sub-customers, so revenue is split by a Tracking Category whose
    // options are project names. An org allows at most 2 active categories.
    if (action === 'list_tracking_categories') {
      const r = await xero('GET', `/TrackingCategories?where=${encodeURIComponent('Status=="ACTIVE"')}`, token, tenantId);
      // deno-lint-ignore no-explicit-any
      const cats = (r.TrackingCategories ?? []).map((c: any) => ({
        id: c.TrackingCategoryID, name: c.Name, optionCount: (c.Options ?? []).length,
      }));
      return json({ categories: cats, canCreate: cats.length < 2 });
    }

    if (action === 'create_tracking_category') {
      const name = String(body.name || 'Project').slice(0, 100);
      const created = await xero('POST', '/TrackingCategories', token, tenantId, { TrackingCategories: [{ Name: name }] });
      const c = created?.TrackingCategories?.[0];
      if (!c?.TrackingCategoryID) return json({ error: 'Xero did not return a tracking category.' }, { status: 400 });
      return json({ id: c.TrackingCategoryID, name: c.Name });
    }

    if (action === 'push_invoice') {
      const invoiceId = body.invoiceId || body.invoice_id;
      if (!invoiceId) return json({ error: 'invoiceId is required' }, { status: 400 });
      const { data: invoice } = await admin.from('invoices').select('*').eq('id', invoiceId).eq('company_id', companyId).maybeSingle();
      if (!invoice) return json({ error: 'Invoice not found' }, { status: 404 });

      const lineItems = invoice.line_items || [];
      const sovEntries = invoice.sov_entries || [];
      const isSov = invoice.billing_mode === 'schedule_of_values';
      if (!isSov && !lineItems.length) return json({ error: 'This invoice has no line items to push.' }, { status: 400 });
      if (isSov && !sovEntries.length) return json({ error: 'This SOV invoice has no billing entries to push.' }, { status: 400 });

      // Resolve the Xero Contact (client): stored id -> find by name -> create.
      let client: any = null;
      if (invoice.client_id) {
        const { data: c } = await admin.from('clients').select('id, name, email, xero_contact_id').eq('id', invoice.client_id).maybeSingle();
        client = c;
      }
      const clientName = invoice.client_name || client?.name || 'Client';
      const clientEmail = invoice.client_email || client?.email;
      let contactId = client?.xero_contact_id || null;
      if (!contactId) {
        const esc = String(clientName).replace(/"/g, '\\"');
        const found = await xero('GET', `/Contacts?where=${encodeURIComponent(`Name=="${esc}"`)}`, token, tenantId).catch(() => ({}));
        contactId = found?.Contacts?.[0]?.ContactID || null;
        if (!contactId) {
          const cp: any = { Name: clientName };
          if (clientEmail) cp.EmailAddress = clientEmail;
          const created = await xero('POST', '/Contacts', token, tenantId, { Contacts: [cp] });
          contactId = created?.Contacts?.[0]?.ContactID || null;
        }
        if (contactId && client?.id) await admin.from('clients').update({ xero_contact_id: contactId }).eq('id', client.id);
      }
      if (!contactId) return json({ error: 'Could not resolve a Xero contact for this invoice.' }, { status: 400 });

      // Project -> Tracking option (Xero has no sub-customers). Best-effort: ensure the option exists.
      let tracking: unknown[] | undefined;
      if (settings.tracking_category_id && invoice.project_name) {
        try {
          await xero('PUT', `/TrackingCategories/${settings.tracking_category_id}/Options`, token, tenantId, { Options: [{ Name: String(invoice.project_name).slice(0, 100) }] });
        } catch (_) { /* option may already exist; ignore */ }
        tracking = [{ TrackingCategoryID: settings.tracking_category_id, Option: String(invoice.project_name).slice(0, 100) }];
      }

      // Account resolution: cost_codes.xero_account_code, then category map, then a fallback revenue account.
      const { data: costCodes } = await admin.from('cost_codes').select('id, code, xero_account_code').eq('company_id', companyId);
      const byId = new Map<string, string>(); const byCode = new Map<string, string>();
      (costCodes || []).forEach((cc: any) => { if (cc.xero_account_code) { byId.set(cc.id, cc.xero_account_code); if (cc.code) byCode.set(String(cc.code).toLowerCase(), cc.xero_account_code); } });
      const categoryMap: Record<string, string> = {};
      for (const [cat, v] of Object.entries((settings.category_item_map || {}) as Record<string, any>)) {
        const code = typeof v === 'string' ? v : (v?.accountCode || v?.code);
        if (code) categoryMap[cat.toLowerCase()] = String(code);
      }
      let fallbackAccount: string | null = null;
      const ensureFallback = async () => {
        if (fallbackAccount) return fallbackAccount;
        const r = await xero('GET', `/Accounts?where=${encodeURIComponent('Class=="REVENUE" AND Status=="ACTIVE"')}`, token, tenantId);
        fallbackAccount = r?.Accounts?.[0]?.Code || null;
        if (!fallbackAccount) throw new Error('No revenue account found in Xero to post invoice lines to.');
        return fallbackAccount;
      };
      const resolveAccount = async (opts: { costCodeId?: string; costCode?: string; category?: string }) => {
        const cat = opts.category ? String(opts.category).toLowerCase() : '';
        const catCode = cat ? (categoryMap[cat] || (cat === 'gc_fee' ? categoryMap['other'] : undefined)) : undefined;
        return (opts.costCodeId && byId.get(opts.costCodeId)) || (opts.costCode && byCode.get(String(opts.costCode).toLowerCase())) || catCode || await ensureFallback();
      };

      const CAT_LABELS: Record<string, string> = { materials: 'Materials', labor: 'Labor', subcontractor: 'Subcontractor', other: 'Other', gc_fee: 'GC / Project Management Fee' };
      const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
      const taxType = settings.default_tax_type || 'NONE';
      const lineAmountTypes = taxType === 'NONE' ? 'NoTax' : 'Exclusive';

      const lines: any[] = [];
      const pushLine = (amount: number, description: string, accountCode: string) => {
        if (amount <= 0) return;
        lines.push({ Description: description || 'Services', Quantity: 1, UnitAmount: amount, AccountCode: accountCode, TaxType: taxType, ...(tracking ? { Tracking: tracking } : {}) });
      };

      if (isSov) {
        const pushSov = async (e: any, prefix?: string) => {
          const amt = round2(e.current_amount); if (amt <= 0) return;
          const cat = String(e.category || 'other').toLowerCase();
          const ptd = Math.round((Number(e.previous_pct) || 0) + (Number(e.current_pct) || 0));
          const label = CAT_LABELS[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1));
          pushLine(amt, `${prefix ? prefix + ' - ' : ''}${label} (PTD ${ptd}%)`, await resolveAccount({ category: cat }));
        };
        for (const e of sovEntries) await pushSov(e);
        for (const e of (invoice.co_sov_entries || [])) await pushSov(e, e.change_order_title || 'Change Order');
      } else {
        for (const li of lineItems) {
          pushLine(round2(li.line_total), [li.name, li.description].filter(Boolean).join(' - ') || li.name || 'Services',
            await resolveAccount({ costCodeId: li.cost_code_id, costCode: li.cost_code, category: li.category }));
        }
      }
      if (!lines.length) return json({ error: 'Nothing to bill on this invoice (all amounts are zero).' }, { status: 400 });

      const autoSend = settings.auto_send === true;
      const invPayload: any = {
        Type: 'ACCREC', Contact: { ContactID: contactId }, LineItems: lines, LineAmountTypes: lineAmountTypes,
        Status: autoSend ? 'AUTHORISED' : 'DRAFT',
      };
      if (invoice.invoice_number) invPayload.InvoiceNumber = String(invoice.invoice_number);
      if (invoice.issue_date) invPayload.Date = invoice.issue_date;
      if (invoice.due_date) invPayload.DueDate = invoice.due_date;

      const created = await xero('POST', '/Invoices', token, tenantId, { Invoices: [invPayload] });
      const inv = created?.Invoices?.[0];
      const xId = inv?.InvoiceID;
      const url = xId ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${xId}` : null;

      let emailed = false;
      if (autoSend && xId && clientEmail) {
        try { await xero('POST', `/Invoices/${xId}/Email`, token, tenantId, {}); emailed = true; } catch (_) { /* leave as authorised */ }
      }
      const upd: Record<string, unknown> = { xero_invoice_id: xId, xero_invoice_url: url };
      if (emailed) upd.status = 'sent';
      await admin.from('invoices').update(upd).eq('id', invoiceId);
      await admin.from('xero_integration_settings').update({ last_sync_at: new Date().toISOString() }).eq('company_id', companyId);

      return json({ xero_invoice_id: xId, invoice_number: inv?.InvoiceNumber, url, emailed });
    }

    return json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
});
