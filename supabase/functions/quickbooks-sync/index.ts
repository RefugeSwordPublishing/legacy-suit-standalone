// QuickBooks sync reads, tenant-scoped. Powers the cost-code -> QBO item/account
// mapping (list_items, list_accounts) with automatic token refresh. The invoice
// push sync (push_invoice etc.) is a later addition.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET') ?? '';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// deno-lint-ignore no-explicit-any
async function refreshAccessToken(admin: any, settings: any) {
  const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: settings.refresh_token }),
  });
  const tokens = await res.json();
  if (!tokens.access_token) throw new Error('Failed to refresh token');
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await admin.from('qbo_integration_settings').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || settings.refresh_token,
    token_expires_at: expiresAt,
  }).eq('id', settings.id);
  return tokens.access_token as string;
}

// deno-lint-ignore no-explicit-any
async function getValidToken(admin: any, settings: any) {
  if (!settings.token_expires_at || new Date(settings.token_expires_at) <= new Date(Date.now() + 60000)) {
    return await refreshAccessToken(admin, settings);
  }
  return settings.access_token as string;
}

async function qboRequest(method: string, path: string, token: string, realmId: string, body?: unknown) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${QBO_BASE}/${realmId}${path}${sep}minorversion=65`;
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// Run a QBO SQL-ish query, return the QueryResponse object.
// deno-lint-ignore no-explicit-any
async function qboQuery(sql: string, token: string, realmId: string): Promise<any> {
  const r = await qboRequest('GET', `/query?query=${encodeURIComponent(sql)}`, token, realmId);
  return r?.QueryResponse ?? {};
}

// QBO invoice lines require an ItemRef. For lines whose cost code isn't mapped to a
// QBO item, fall back to a single generic Service item (found or created once).
async function ensureFallbackItem(token: string, realmId: string): Promise<string> {
  const found = await qboQuery(`SELECT Id FROM Item WHERE Name = 'GuildWright Services' MAXRESULTS 1`, token, realmId);
  if (found?.Item?.[0]?.Id) return found.Item[0].Id;
  const acct = await qboQuery(`SELECT Id FROM Account WHERE AccountType = 'Income' MAXRESULTS 1`, token, realmId);
  const incomeId = acct?.Account?.[0]?.Id;
  if (!incomeId) throw new Error('No Income account found in QuickBooks to attach a default item to.');
  const created = await qboRequest('POST', '/item', token, realmId, {
    Name: 'GuildWright Services', Type: 'Service', IncomeAccountRef: { value: incomeId },
  });
  return created?.Item?.Id;
}

// GuildWright's payment-term codes and the QuickBooks Term each one means. QBO ships the first
// four by default; a company that deleted one gets it recreated with matching due days.
const TERM_MAP: Record<string, { name: string; dueDays: number }> = {
  due_on_receipt: { name: 'Due on receipt', dueDays: 0 },
  net_10: { name: 'Net 10', dueDays: 10 },
  net_15: { name: 'Net 15', dueDays: 15 },
  net_30: { name: 'Net 30', dueDays: 30 },
};

// Resolve a GuildWright payment term to a QBO Term id so the pushed invoice shows the same terms
// the client sees on ours. Names are matched case-insensitively because QBO's stock term is
// "Due on receipt" and a tenant may have retyped it differently.
async function ensureTermRef(code: string, token: string, realmId: string): Promise<string | null> {
  const want = TERM_MAP[String(code || '')];
  if (!want) return null;
  const all = await qboQuery('SELECT Id, Name FROM Term MAXRESULTS 200', token, realmId);
  // deno-lint-ignore no-explicit-any
  const hit = (all?.Term || []).find((t: any) => String(t?.Name || '').trim().toLowerCase() === want.name.toLowerCase());
  if (hit?.Id) return hit.Id;
  const created = await qboRequest('POST', '/term', token, realmId, { Name: want.name, DueDays: want.dueDays });
  return created?.Term?.Id || null;
}

// Keep the QBO customer's contact details in step with GuildWright.
//  - Email: filled in only when QBO has none, so a tenant's own edit is never overwritten. Without
//    this the address never reaches QBO at all: it used to be written only when the parent customer
//    was first created, and never on the project sub-customer the invoice actually bills.
//  - Delivery method: the app owns the auto-send toggle, so it owns this. With auto-send off it is
//    set to None, which is what stops QBO from mailing the client on its own now that it knows an
//    address (an invoice carrying a recipient has been delivered before with EmailStatus=NotSet).
async function ensureCustomerContact(
  customerId: string, email: string | null | undefined, autoSend: boolean, token: string, realmId: string,
) {
  const cur = await qboRequest('GET', `/customer/${customerId}`, token, realmId);
  const c = cur?.Customer;
  if (!c?.Id) return;
  // deno-lint-ignore no-explicit-any
  const patch: any = {};
  if (email && !c.PrimaryEmailAddr?.Address) patch.PrimaryEmailAddr = { Address: email };
  const wantMethod = autoSend ? 'Email' : 'None';
  if (c.PreferredDeliveryMethod !== wantMethod) patch.PreferredDeliveryMethod = wantMethod;
  if (!Object.keys(patch).length) return;
  await qboRequest('POST', '/customer', token, realmId, { Id: c.Id, SyncToken: c.SyncToken, sparse: true, ...patch });
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

    const { data: settings } = await admin.from('qbo_integration_settings').select('*').eq('company_id', companyId).maybeSingle();
    if (!settings?.is_connected) return json({ error: 'QuickBooks not connected' }, { status: 400 });

    let token: string;
    try { token = await getValidToken(admin, settings); }
    catch (err) { return json({ error: 'Failed to refresh QBO token', details: (err as Error).message }, { status: 401 }); }
    const realmId = settings.realm_id;

    if (action === 'list_accounts') {
      const query = encodeURIComponent(`SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 100`);
      const result = await qboRequest('GET', `/query?query=${query}`, token, realmId);
      const accounts = result?.QueryResponse?.Account ?? [];
      // deno-lint-ignore no-explicit-any
      return json({ accounts: accounts.map((a: any) => ({ Id: a.Id, Name: a.Name, AccountType: a.AccountType })) });
    }

    if (action === 'list_items') {
      const query = encodeURIComponent(`SELECT * FROM Item WHERE Active = true MAXRESULTS 1000`);
      const result = await qboRequest('GET', `/query?query=${query}`, token, realmId);
      const items = result?.QueryResponse?.Item ?? [];
      // QBO "Category" items are grouping headers and cannot be used on an invoice line
      // (referencing one throws "Invalid Reference Id", code 2500). Only offer sellable items.
      // deno-lint-ignore no-explicit-any
      const sellable = items.filter((i: any) => i.Type !== 'Category');
      // deno-lint-ignore no-explicit-any
      return json({ items: sellable.map((i: any) => ({ Id: i.Id, Name: i.Name, Type: i.Type })) });
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
      if (isSov && !sovEntries.length) return json({ error: 'This Schedule-of-Values invoice has no billing entries to push.' }, { status: 400 });

      const warnings: string[] = [];
      const autoSend = settings.auto_send === true;

      // Resolve the parent QBO customer (the client): stored id -> find by name -> create.
      let client: any = null;
      if (invoice.client_id) {
        const { data: c } = await admin.from('clients').select('id, name, email, quickbooks_customer_id').eq('id', invoice.client_id).maybeSingle();
        client = c;
      }
      const clientName = invoice.client_name || client?.name || 'Client';
      const clientEmail = invoice.client_email || client?.email;
      let parentCustomerId = client?.quickbooks_customer_id || null;
      if (!parentCustomerId) {
        const esc = String(clientName).replace(/'/g, "\\'");
        const found = await qboQuery(`SELECT Id FROM Customer WHERE DisplayName = '${esc}' MAXRESULTS 1`, token, realmId);
        parentCustomerId = found?.Customer?.[0]?.Id || null;
        if (!parentCustomerId) {
          const cp: any = { DisplayName: clientName };
          if (clientEmail) cp.PrimaryEmailAddr = { Address: clientEmail };
          const createdC = await qboRequest('POST', '/customer', token, realmId, cp);
          parentCustomerId = createdC?.Customer?.Id || null;
        }
        if (parentCustomerId && client?.id) {
          await admin.from('clients').update({ quickbooks_customer_id: parentCustomerId }).eq('id', client.id);
        }
      }
      if (!parentCustomerId) return json({ error: 'Could not resolve a QuickBooks customer for this invoice.' }, { status: 400 });

      // Nest the project under the client as a QBO sub-customer (a "Job"), so each project is
      // tracked separately beneath the client (like Contractor Foreman). Gated by the Projects
      // sync toggle; with no project (or the toggle off) the invoice bills the client directly.
      let customerId = parentCustomerId;
      if (settings.sync_projects && invoice.project_id) {
        const { data: project } = await admin.from('projects').select('id, name, quickbooks_project_id').eq('id', invoice.project_id).maybeSingle();
        const projectName = invoice.project_name || project?.name;
        if (projectName) {
          let subId = project?.quickbooks_project_id || null;
          if (!subId) {
            const escP = String(projectName).replace(/'/g, "\\'");
            const foundSub = await qboQuery(
              `SELECT Id, ParentRef FROM Customer WHERE DisplayName = '${escP}' AND Job = true MAXRESULTS 5`, token, realmId);
            subId = (foundSub?.Customer || []).find((c: any) => c?.ParentRef?.value === String(parentCustomerId))?.Id || null;
            if (!subId) {
              // QBO requires a globally-unique DisplayName; if the plain project name collides,
              // fall back to "Client - Project".
              const base = { Job: true, ParentRef: { value: parentCustomerId }, BillWithParent: true };
              try {
                const c = await qboRequest('POST', '/customer', token, realmId, { ...base, DisplayName: projectName });
                subId = c?.Customer?.Id || null;
              } catch (_) {
                const c = await qboRequest('POST', '/customer', token, realmId, { ...base, DisplayName: `${clientName} - ${projectName}` });
                subId = c?.Customer?.Id || null;
              }
            }
          }
          if (subId) {
            customerId = subId;
            if (project?.id) await admin.from('projects').update({ quickbooks_project_id: subId }).eq('id', project.id);
          }
        }
      }


      // Push the client's email and the delivery method onto the QBO customer records (parent and,
      // when projects sync, the job the invoice bills). This is what a manual Send in QBO reads
      // from; before this the address never left GuildWright.
      const contactEmail = invoice.client_email || client?.email;
      for (const cid of [...new Set([parentCustomerId, customerId])]) {
        try {
          await ensureCustomerContact(cid, contactEmail, autoSend, token, realmId);
        } catch (_) {
          warnings.push('Could not update the client contact details in QuickBooks. The invoice still pushed.');
        }
      }
      // cost code -> QBO item map (by id and by code string)
      const { data: costCodes } = await admin.from('cost_codes').select('id, code, quickbooks_item_id').eq('company_id', companyId);
      const byId = new Map<string, string>();
      const byCode = new Map<string, string>();
      (costCodes || []).forEach((cc: any) => {
        if (cc.quickbooks_item_id) {
          byId.set(cc.id, cc.quickbooks_item_id);
          if (cc.code) byCode.set(String(cc.code).toLowerCase(), cc.quickbooks_item_id);
        }
      });

      // Schedule-of-Values invoices roll up to estimate categories (materials/labor/
      // subcontractor/other/gc_fee) with no cost code, so fall back to a category -> QBO item map.
      const categoryMap: Record<string, string> = {};
      const rawCatMap = (settings.category_item_map || {}) as Record<string, any>;
      for (const [cat, v] of Object.entries(rawCatMap)) {
        const id = typeof v === 'string' ? v : v?.id;
        if (id) categoryMap[cat.toLowerCase()] = String(id);
      }

      // The set of item ids that can actually be used on an invoice line. QBO "Category" items
      // are grouping headers; referencing one throws "Invalid Reference Id" (code 2500) and
      // fails the whole push. Validate every mapped id against this set and fall back cleanly.
      const usableItems = new Set<string>();
      try {
        const itemsRes = await qboQuery(`SELECT Id, Type FROM Item WHERE Active = true MAXRESULTS 1000`, token, realmId);
        for (const it of (itemsRes?.Item || [])) {
          if (it?.Id && it?.Type !== 'Category') usableItems.add(String(it.Id));
        }
      } catch (_) { /* if the lookup fails, skip validation and let QBO be the judge */ }
      const validate = (id: string | null) => (id && (!usableItems.size || usableItems.has(id))) ? id : null;

      let fallbackItemId: string | null = null;
      const resolveItem = async (opts: { costCodeId?: string; costCode?: string; category?: string; label?: string }): Promise<string> => {
        const cat = opts.category ? String(opts.category).toLowerCase() : '';
        // gc_fee shares the "other" category mapping.
        const catItem = cat ? (categoryMap[cat] || (cat === 'gc_fee' ? categoryMap['other'] : undefined)) : undefined;
        const mapped = (opts.costCodeId && byId.get(opts.costCodeId)) ||
                       (opts.costCode && byCode.get(String(opts.costCode).toLowerCase())) ||
                       catItem || null;
        let itemId = validate(mapped as string | null);
        if (mapped && !itemId) {
          warnings.push(`"${opts.label || opts.category || opts.costCode || 'A line'}" is mapped to a QuickBooks item that can't be invoiced (it's a category or was removed). Used the default item instead - remap it to a product/service.`);
        }
        if (!itemId) {
          if (!fallbackItemId) fallbackItemId = await ensureFallbackItem(token, realmId);
          itemId = fallbackItemId;
        }
        return itemId as string;
      };

      const CAT_LABELS: Record<string, string> = {
        materials: 'Materials', labor: 'Labor', subcontractor: 'Subcontractor',
        other: 'Other', gc_fee: 'GC / Project Management Fee',
      };
      const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

      const lines: any[] = [];
      if (isSov) {
        // Bill this period's amount per category (current_amount) and label the line with the
        // percent complete to date, e.g. "Labor (PTD 75%)".
        const pushSov = async (entry: any, titlePrefix?: string) => {
          const amount = round2(entry.current_amount);
          if (amount <= 0) return;
          const cat = String(entry.category || 'other').toLowerCase();
          const ptd = Math.round((Number(entry.previous_pct) || 0) + (Number(entry.current_pct) || 0));
          const label = CAT_LABELS[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1));
          const desc = `${titlePrefix ? titlePrefix + ' - ' : ''}${label} (PTD ${ptd}%)`;
          const itemId = await resolveItem({ category: cat, label });
          lines.push({
            DetailType: 'SalesItemLineDetail',
            Amount: amount,
            Description: desc,
            SalesItemLineDetail: { ItemRef: { value: itemId } },
          });
        };
        for (const entry of sovEntries) await pushSov(entry);
        for (const entry of (invoice.co_sov_entries || [])) await pushSov(entry, entry.change_order_title || 'Change Order');
      } else {
        for (const li of lineItems) {
          const itemId = await resolveItem({ costCodeId: li.cost_code_id, costCode: li.cost_code, category: li.category, label: li.name });
          const qty = Number(li.quantity) || 1;
          const amount = round2(li.line_total);
          const unitPrice = qty > 0 ? round2(amount / qty) : amount;
          // QBO rejects a line where Qty * UnitPrice does not reconcile to Amount (rounding/markup).
          // Only send Qty/UnitPrice when they match to the penny; otherwise send Amount alone.
          const detail: Record<string, unknown> = { ItemRef: { value: itemId } };
          if (qty > 0 && Math.abs(unitPrice * qty - amount) < 0.01) {
            detail.Qty = qty;
            detail.UnitPrice = unitPrice;
          }
          lines.push({
            DetailType: 'SalesItemLineDetail',
            Amount: amount,
            Description: [li.name, li.description].filter(Boolean).join(' - ') || li.name || undefined,
            SalesItemLineDetail: detail,
          });
        }
      }
      if (!lines.length) return json({ error: 'Nothing to bill on this invoice (all amounts are zero).' }, { status: 400 });

      const invPayload: any = { CustomerRef: { value: customerId }, Line: lines };
      // Force the QBO document number to match the GuildWright invoice number.
      // (Requires "Custom transaction numbers" enabled in QuickBooks; otherwise QBO
      // ignores this and auto-assigns its own number.)
      if (invoice.invoice_number) invPayload.DocNumber = String(invoice.invoice_number).slice(0, 21);
      if (invoice.issue_date) invPayload.TxnDate = invoice.issue_date;
      if (invoice.due_date) invPayload.DueDate = invoice.due_date;
      // Carry the payment term across so the QBO invoice reads the same as ours. DueDate is still
      // sent explicitly above and wins over the term's own due-date math, so the two agree.
      if (invoice.payment_terms) {
        try {
          const termId = await ensureTermRef(invoice.payment_terms, token, realmId);
          if (termId) invPayload.SalesTermRef = { value: termId };
          else warnings.push(`"${invoice.payment_terms}" is not a payment term QuickBooks knows; the QBO invoice has no term set.`);
        } catch (_) {
          warnings.push('Could not set the payment term on the QuickBooks invoice.');
        }
      }
      const billEmail = invoice.client_email || client?.email;
      // Only attach a recipient (BillEmail) when auto-send is ON. QBO will auto-deliver an invoice
      // that carries a BillEmail when the customer's preferred delivery method is Email, even with
      // EmailStatus=NotSet, which was silently emailing clients while auto-send was off. Leaving
      // BillEmail off means QBO has no recipient and physically cannot send. The address still
      // reaches QBO on the customer record above, so a manual Send there is prefilled.
      if (autoSend && billEmail) invPayload.BillEmail = { Address: billEmail };
      // Auto-send off => land as an un-emailed draft for the tenant to review before sending.
      invPayload.EmailStatus = autoSend && billEmail ? 'NeedToSend' : 'NotSet';


      // QuickBooks can deliver an invoice on its own, whatever we send. With company-level online
      // delivery on, QBO fills BillEmail itself (observed: it carried an address forward from the
      // customer's previous invoice, one that had never existed in GuildWright) and mails it
      // minutes after creation, ignoring EmailStatus=NotSet, an absent BillEmail, and the
      // customer's PreferredDeliveryMethod=None. We cannot stop that from the invoice payload, so
      // say so plainly rather than reporting a quiet draft while the client gets an email.
      if (!autoSend) {
        try {
          const prefs = await qboQuery('SELECT * FROM Preferences', token, realmId);
          const eStatus = prefs?.Preferences?.[0]?.SalesFormsPrefs?.ETransactionEnabledStatus;
          if (eStatus === 'Enabled') {
            warnings.push('QuickBooks online delivery is turned on for this company, so QuickBooks may email this invoice to the client even though auto-send is off. Turn off online delivery in QuickBooks under Settings, Sales, if you do not want that.');
          }
        } catch (_) { /* a preferences read failure must not fail the push */ }
      }
      const created = await qboRequest('POST', '/invoice', token, realmId, invPayload);
      const qboId = created?.Invoice?.Id;
      const qboDoc = created?.Invoice?.DocNumber;
      const qboUrl = qboId ? `https://app.qbo.intuit.com/app/invoice?txnId=${qboId}` : null;

      // Only email the client (and mark the GuildWright invoice 'sent') when auto-send is on.
      let emailed = false;
      if (autoSend && qboId && billEmail) {
        try {
          await qboRequest('POST', `/invoice/${qboId}/send?sendTo=${encodeURIComponent(billEmail)}`, token, realmId);
          emailed = true;
        } catch (_) { /* leave as draft in QBO; report not emailed */ }
      }

      const invUpdate: Record<string, unknown> = { quickbooks_invoice_id: qboId, quickbooks_invoice_url: qboUrl };
      if (emailed) invUpdate.status = 'sent';
      await admin.from('invoices').update(invUpdate).eq('id', invoiceId);

      return json({ quickbooks_invoice_id: qboId, doc_number: qboDoc, url: qboUrl, emailed, warnings: [...new Set(warnings)] });
    }

    return json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
});
