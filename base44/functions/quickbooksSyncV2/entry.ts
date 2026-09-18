import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
};

function secureJson(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...(init.headers || {}), ...SECURITY_HEADERS },
  });
}

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';

async function refreshAccessToken(settings, base44) {
  const QBO_CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const QBO_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
  const credentials = btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: settings.refresh_token,
    }),
  });
  const tokens = await res.json();
  if (!tokens.access_token) throw new Error('Failed to refresh token');
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await base44.asServiceRole.entities.QBOIntegrationSettings.update(settings.id, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || settings.refresh_token,
    token_expires_at: expiresAt,
  });
  return tokens.access_token;
}

async function getValidToken(settings, base44) {
  if (!settings.token_expires_at || new Date(settings.token_expires_at) <= new Date(Date.now() + 60000)) {
    return await refreshAccessToken(settings, base44);
  }
  return settings.access_token;
}

async function qboRequest(method, path, body, token, realmId) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${QBO_BASE}/${realmId}${path}${separator}minorversion=65`;
  console.log(`QBO Request: ${method} ${path}`, body ? JSON.stringify(body) : '');
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`QBO Error [${res.status}] ${method} ${path}:`, JSON.stringify(data));
    console.error(`QBO Rejected Payload:`, JSON.stringify(body));
    throw new Error(JSON.stringify(data));
  }
  return data;
}

async function findOrCreateCustomer(client, token, realmId, base44) {
  if (client.quickbooks_customer_id) {
    console.log(`Using stored quickbooks_customer_id: ${client.quickbooks_customer_id}`);
    return client.quickbooks_customer_id;
  }

  const escapedName = (client.name || '').replace(/'/g, "\\'");
  const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${escapedName}'`);
  const searchResult = await qboRequest('GET', `/query?query=${query}`, null, token, realmId);
  const found = searchResult?.QueryResponse?.Customer?.[0];
  if (found) {
    console.log(`Found existing QBO customer "${client.name}" with Id ${found.Id}`);
    await base44.asServiceRole.entities.Client.update(client.id, { quickbooks_customer_id: found.Id });
    client.quickbooks_customer_id = found.Id;
    return found.Id;
  }

  const customerBody = { DisplayName: client.name };
  if (client.email) customerBody.PrimaryEmailAddr = { Address: client.email };
  if (client.phone) customerBody.PrimaryPhone = { FreeFormNumber: client.phone };
  if (client.billing_address || client.city || client.state || client.zip) {
    customerBody.BillAddr = {
      Line1: client.billing_address || '',
      City: client.city || '',
      CountrySubDivisionCode: client.state || '',
      PostalCode: client.zip || '',
    };
  }

  console.log(`Creating new QBO customer for "${client.name}"`);
  const createResult = await qboRequest('POST', '/customer', customerBody, token, realmId);
  const newId = createResult?.Customer?.Id;
  if (newId) {
    await base44.asServiceRole.entities.Client.update(client.id, { quickbooks_customer_id: newId });
    client.quickbooks_customer_id = newId;
  }
  return newId || null;
}

async function syncClient(client, token, realmId, base44) {
  const qbCustomerId = await findOrCreateCustomer(client, token, realmId, base44);
  if (qbCustomerId) {
    const existing = await qboRequest('GET', `/customer/${qbCustomerId}`, null, token, realmId);
    const qbCustomer = existing.Customer;
    await qboRequest('POST', '/customer', {
      ...qbCustomer,
      DisplayName: client.name,
      PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
      PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    }, token, realmId);
  }
  return client;
}

async function syncProject(project, clientQbId, token, realmId, base44) {
  if (project.quickbooks_project_id) {
    const existing = await qboRequest('GET', `/customer/${project.quickbooks_project_id}`, null, token, realmId);
    const qbCustomer = existing.Customer;
    await qboRequest('POST', '/customer', { ...qbCustomer, DisplayName: project.name }, token, realmId);
  } else {
    const body = { DisplayName: project.name, Job: true };
    if (clientQbId) body.ParentRef = { value: clientQbId };
    const result = await qboRequest('POST', '/customer', body, token, realmId);
    const qbId = result.Customer?.Id;
    if (qbId) {
      await base44.asServiceRole.entities.Project.update(project.id, { quickbooks_project_id: qbId });
      project.quickbooks_project_id = qbId;
    }
  }
  return project;
}

function categoryLabel(cat) {
  if (!cat) return 'Other';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

async function getDefaultIncomeAccountRef(token, realmId, cache) {
  if (cache.defaultIncomeAccountRef) return cache.defaultIncomeAccountRef;
  const query = encodeURIComponent(`SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 1`);
  const result = await qboRequest('GET', `/query?query=${query}`, null, token, realmId);
  const account = result?.QueryResponse?.Account?.[0];
  if (!account) {
    console.warn('WARNING: No income account found in QBO, falling back to hardcoded account Id "1". Set per-cost-code income accounts to avoid this.');
    cache.defaultIncomeAccountRef = { value: '1' };
    return cache.defaultIncomeAccountRef;
  }
  console.log(`Default QBO income account: "${account.Name}" (Id: ${account.Id})`);
  cache.defaultIncomeAccountRef = { value: account.Id };
  return cache.defaultIncomeAccountRef;
}

async function findOrCreateItem(name, itemCache, incomeAccountRef, token, realmId) {
  if (itemCache[name]) return itemCache[name];
  const escapedName = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(`SELECT * FROM Item WHERE Name = '${escapedName}'`);
  const result = await qboRequest('GET', `/query?query=${query}`, null, token, realmId);
  const found = result?.QueryResponse?.Item?.[0];
  if (found) {
    console.log(`Found QBO item "${name}" with Id ${found.Id}`);
    itemCache[name] = found.Id;
    return found.Id;
  }
  const created = await qboRequest('POST', '/item', {
    Name: name,
    Type: 'Service',
    IncomeAccountRef: incomeAccountRef,
  }, token, realmId);
  const newId = created?.Item?.Id;
  console.log(`Created QBO item "${name}" with Id ${newId}`);
  itemCache[name] = newId;
  return newId;
}

async function syncInvoice(invoice, client, project, token, realmId, base44, costCodes = [], approvedChangeOrders = [], priorInvoices = []) {
  let customerRefValue = null;
  if (client) {
    customerRefValue = await findOrCreateCustomer(client, token, realmId, base44);
  }
  const customerRef = customerRefValue ? { value: customerRefValue } : undefined;

  const itemCache = {};
  const accountRefCache = {}; // lazy cache: { defaultIncomeAccountRef }

  let lineItems = [];

  const sovEntries = invoice.sov_entries || [];

  if (invoice.billing_mode === 'schedule_of_values') {
    const coSovEntries = invoice.co_sov_entries || [];
    console.log(`SOV base entries:`, JSON.stringify(sovEntries.map(e => ({ cat: e.category, total: e.category_total, pct: e.current_pct }))));
    console.log(`CO SOV entries:`, JSON.stringify(coSovEntries.map(e => ({ co: e.change_order_title, cat: e.category, total: e.category_total, pct: e.current_pct }))));

    // Build combined amount per category: base SOV + CO SOV entries
    const amountByCategory = {};
    const ptdByCategory = {};

    for (const entry of sovEntries) {
      const cat = entry.category;
      const pct = entry.current_pct || 0;
      const amount = parseFloat(((entry.category_total || 0) * pct / 100).toFixed(2));
      amountByCategory[cat] = (amountByCategory[cat] || 0) + amount;
      ptdByCategory[cat] = pct; // base current_pct for PTD display
      console.log(`Base SOV "${cat}": category_total=${entry.category_total}, current_pct=${pct}, amount=${amount}`);
    }

    for (const coEntry of coSovEntries) {
      const cat = coEntry.category;
      const pct = coEntry.current_pct || 0;
      const amount = parseFloat(((coEntry.category_total || 0) * pct / 100).toFixed(2));
      amountByCategory[cat] = (amountByCategory[cat] || 0) + amount;
      console.log(`CO SOV "${coEntry.change_order_title}" cat="${cat}": category_total=${coEntry.category_total}, current_pct=${pct}, amount=${amount}`);
    }

    console.log(`Combined amounts by category:`, JSON.stringify(amountByCategory));

    // GC Fee SOV row, combined base + approved CO GC fees
    const gcEntry = (invoice.sov_entries || []).find(e => e.category === 'gc_fee');
    if (gcEntry && gcEntry.current_pct > 0) {
      // Fetch estimate to get base GC fee
      let baseGcFee = 0;
      let gcFeePct = 0;
      let gcFeeLabel = 'GC / Project Management Fee';
      const allEstimates = await base44.asServiceRole.entities.Estimate.list();
      const linkedEstimate = allEstimates.find(e => e.project_id === invoice.project_id && e.status === 'approved')
        || allEstimates.find(e => e.project_id === invoice.project_id);
      if (linkedEstimate?.gc_fee_enabled === true) {
        gcFeePct = linkedEstimate.gc_fee_pct ?? 0;
        gcFeeLabel = linkedEstimate.gc_fee_label || gcFeeLabel;
        baseGcFee = (linkedEstimate.grand_total || 0) * (gcFeePct / 100);
      }
      // Sum CO GC fees
      const coGcFee = allChangeOrders.reduce((sum, co) => {
        if (co.gc_fee_enabled === true) {
          return sum + (co.change_order_total || 0) * ((co.gc_fee_pct ?? 0) / 100);
        }
        return sum;
      }, 0);
      const combinedGcTotal = baseGcFee + coGcFee;
      const gcAmount = parseFloat((combinedGcTotal * (gcEntry.current_pct / 100)).toFixed(2));
      console.log(`GC Fee SOV: baseGcFee=${baseGcFee}, coGcFee=${coGcFee}, combinedTotal=${combinedGcTotal}, current_pct=${gcEntry.current_pct}, amount=${gcAmount}`);
      if (gcAmount > 0) {
        const defaultRef = await getDefaultIncomeAccountRef(token, realmId, accountRefCache);
        const gcItemId = await findOrCreateItem(gcFeeLabel, itemCache, defaultRef, token, realmId);
        lineItems.push({
          Amount: gcAmount,
          DetailType: 'SalesItemLineDetail',
          Description: `${gcFeeLabel} (PTD ${gcEntry.current_pct}%)`,
          SalesItemLineDetail: {
            ItemRef: { value: gcItemId },
            UnitPrice: gcAmount,
            Qty: 1,
          },
        });
      }
    }

    for (const [cat, amount] of Object.entries(amountByCategory)) {
      if (amount === 0) continue;
      const label = categoryLabel(cat);
      const ptdDisplay = ptdByCategory[cat] ?? 0;
      const defaultRef = await getDefaultIncomeAccountRef(token, realmId, accountRefCache);
      const itemId = await findOrCreateItem(label, itemCache, defaultRef, token, realmId);
      lineItems.push({
        Amount: amount,
        DetailType: 'SalesItemLineDetail',
        Description: `${label} (PTD ${ptdDisplay}%)`,
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          UnitPrice: amount,
          Qty: 1,
        },
      });
    }
  } else {
    const baseLinesRaw = invoice.line_items || [];
    const baseTotal = baseLinesRaw.reduce((s, li) => s + (li.line_total || 0), 0);
    const allLines = [...baseLinesRaw];
    if (invoice.gc_fee_enabled === true) {
      const gcAmount = baseTotal * ((invoice.gc_fee_pct || 0) / 100);
      allLines.push({
        name: invoice.gc_fee_label || 'GC / Project Management Fee',
        category: 'gc_fee',
        line_total: gcAmount,
      });
    }
    for (const li of allLines) {
      const amount = parseFloat((li.line_total || 0).toFixed(2));
      if (amount === 0) continue;
      const itemName = li.category === 'gc_fee'
        ? (li.name || 'GC / Project Management Fee')
        : categoryLabel(li.category || 'other');
      console.log(`Line item "${li.name || li.description}": category="${itemName}", cost_code_id="${li.cost_code_id}", amount=${amount}`);
      const mappedCode = li.cost_code_id ? costCodes.find(c => c.id === li.cost_code_id) : null;
      let itemId;
      if (mappedCode?.quickbooks_item_id) {
        console.log(`Using mapped QBO item_id=${mappedCode.quickbooks_item_id} (${mappedCode.quickbooks_item_name}) for cost_code "${mappedCode.name}"`);
        itemId = mappedCode.quickbooks_item_id;
      } else {
        let incomeRef;
        if (mappedCode?.quickbooks_income_account_id) {
          incomeRef = { value: mappedCode.quickbooks_income_account_id };
          console.log(`Using per-cost-code income account ${mappedCode.quickbooks_income_account_id} (${mappedCode.quickbooks_income_account_name}) for "${mappedCode.name}"`);
        } else {
          incomeRef = await getDefaultIncomeAccountRef(token, realmId, accountRefCache);
        }
        itemId = await findOrCreateItem(itemName, itemCache, incomeRef, token, realmId);
      }
      lineItems.push({
        Amount: amount,
        DetailType: 'SalesItemLineDetail',
        Description: li.name || li.description || itemName,
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          UnitPrice: amount,
          Qty: 1,
        },
      });
    }
  }

  lineItems = lineItems.map((li, idx) => ({ ...li, Id: String(idx + 1), LineNum: idx + 1 }));

  if (invoice.quickbooks_invoice_id) {
    const existing = await qboRequest('GET', `/invoice/${invoice.quickbooks_invoice_id}`, null, token, realmId);
    const qbInvoice = existing.Invoice;
    console.log(`Updating QBO invoice Id=${qbInvoice.Id} SyncToken=${qbInvoice.SyncToken}`);
    await qboRequest('POST', '/invoice', {
      ...qbInvoice,
      Line: lineItems,
      CustomerRef: customerRef || qbInvoice.CustomerRef,
      DueDate: invoice.due_date || undefined,
      DocNumber: invoice.invoice_number || undefined,
      EmailStatus: 'NotSet',
      AllowOnlineCreditCardPayment: false,
      AllowOnlineACHPayment: false,
    }, token, realmId);
    const qbUrl = `https://app.qbo.intuit.com/app/invoice?txnId=${invoice.quickbooks_invoice_id}`;
    await base44.asServiceRole.entities.Invoice.update(invoice.id, { quickbooks_invoice_url: qbUrl });
  } else {
    const body = {
      Line: lineItems,
      DueDate: invoice.due_date || undefined,
      DocNumber: invoice.invoice_number || undefined,
      CustomerMemo: { value: invoice.notes || '' },
      EmailStatus: 'NotSet',
      AllowOnlineCreditCardPayment: false,
      AllowOnlineACHPayment: false,
    };
    if (customerRef) body.CustomerRef = customerRef;
    const result = await qboRequest('POST', '/invoice', body, token, realmId);
    const qbId = result.Invoice?.Id;
    if (qbId) {
      const qbUrl = `https://app.qbo.intuit.com/app/invoice?txnId=${qbId}`;
      await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        quickbooks_invoice_id: qbId,
        quickbooks_invoice_url: qbUrl,
        status: 'sent',
      });
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    console.log('Request received, action:', body?.action, 'invoice_id:', body?.invoice_id);
    const user = await base44.auth.me();
    if (!user) return secureJson({ error: 'Unauthorized' }, { status: 401 });
    console.log('Function started, action:', body?.action, 'invoice_id:', body?.invoice_id);
    const { action, invoice_id } = body;

    const settingsList = await base44.asServiceRole.entities.QBOIntegrationSettings.list();
    const settings = settingsList[0];
    if (!settings?.is_connected) {
      return secureJson({ error: 'QuickBooks not connected' }, { status: 400 });
    }
    let token;
    try {
      token = await getValidToken(settings, base44);
    } catch (err) {
      console.error('Token refresh failed:', err.message);
      return secureJson({ error: 'Failed to refresh QBO token', details: err.message }, { status: 401 });
    }
    const realmId = settings.realm_id;

    if (action === 'list_accounts') {
      const query = encodeURIComponent(`SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 100`);
      const result = await qboRequest('GET', `/query?query=${query}`, null, token, realmId);
      const accounts = result?.QueryResponse?.Account || [];
      console.log(`list_accounts: returned ${accounts.length} income accounts`);
      return secureJson({ accounts: accounts.map(a => ({ Id: a.Id, Name: a.Name, AccountType: a.AccountType })) });
    }

    if (action === 'list_items') {
      const expiresAt = settings.token_expires_at ? new Date(settings.token_expires_at) : null;
      const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
      const freshToken = (!expiresAt || expiresAt <= fiveMinFromNow)
        ? await refreshAccessToken(settings, base44)
        : token;
      const query = encodeURIComponent(`SELECT * FROM Item WHERE Active = true MAXRESULTS 200`);
      const result = await qboRequest('GET', `/query?query=${query}`, null, freshToken, realmId);
      const items = result?.QueryResponse?.Item || [];
      console.log(`list_items: returned ${items.length} items`);
      return secureJson({ items: items.map(i => ({ Id: i.Id, Name: i.Name, Type: i.Type })) });
    }

    if (action === 'push_invoice') {
      console.log('Starting push_invoice for:', invoice_id);
      const invoice = await base44.asServiceRole.entities.Invoice.get(invoice_id);
      if (!invoice) return secureJson({ error: 'Invoice not found' }, { status: 404 });

      const clients = invoice.client_id ? await base44.asServiceRole.entities.Client.list() : [];
      const projects = (settings.sync_projects && invoice.project_id) ? await base44.asServiceRole.entities.Project.list() : [];
      const costCodes = await base44.asServiceRole.entities.CostCode.list();
      const allChangeOrders = invoice.project_id
        ? await base44.asServiceRole.entities.ClientChangeOrder.list().then(all => all.filter(co => co.project_id === invoice.project_id && co.status === 'approved'))
        : [];
      const allProjectInvoices = invoice.project_id
        ? await base44.asServiceRole.entities.Invoice.list().then(all => all.filter(inv => inv.project_id === invoice.project_id))
        : [];

      const priorInvoices = allProjectInvoices.filter(
        inv => inv.id !== invoice.id &&
        (inv.status === 'sent' || inv.status === 'paid') &&
        inv.billing_mode === 'schedule_of_values'
      );
      console.log(`Found ${priorInvoices.length} prior sent/paid SOV invoices for project ${invoice.project_id}`);

      let client = invoice.client_id ? (clients.find(c => c.id === invoice.client_id) || null) : null;
      let project = null;

      if (settings.sync_projects && invoice.project_id) {
        project = projects.find(p => p.id === invoice.project_id) || null;
        if (project && client?.quickbooks_customer_id) {
          project = await syncProject(project, client.quickbooks_customer_id, token, realmId, base44);
        }
      }

      if (settings.sync_invoices) {
        await syncInvoice(invoice, client, project, token, realmId, base44, costCodes, allChangeOrders, priorInvoices);
      }

      await base44.asServiceRole.entities.QBOIntegrationSettings.update(settings.id, {
        last_sync_at: new Date().toISOString(),
      });

      return secureJson({ success: true });
    }

    if (action === 'delete_invoice') {
      const { quickbooks_invoice_id } = body;
      if (!quickbooks_invoice_id) return secureJson({ error: 'Missing quickbooks_invoice_id' }, { status: 400 });
      const existing = await qboRequest('GET', `/invoice/${quickbooks_invoice_id}`, null, token, realmId);
      const qbInvoice = existing.Invoice;
      await qboRequest('POST', '/invoice', {
        ...qbInvoice,
        sparse: true,
        PrivateNote: 'Voided from Legacy Renovations app',
      }, token, realmId);
      await qboRequest('POST', `/invoice?operation=delete`, { Id: quickbooks_invoice_id, SyncToken: qbInvoice.SyncToken }, token, realmId);
      return secureJson({ success: true });
    }

    return secureJson({ error: 'Unknown action' }, { status: 400 });
  } catch (topLevelErr) {
    console.error('TOP LEVEL CRASH:', topLevelErr?.message, topLevelErr?.stack);
    return new Response(JSON.stringify({ error: topLevelErr?.message, stack: topLevelErr?.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});