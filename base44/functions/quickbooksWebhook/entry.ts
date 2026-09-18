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

// QuickBooks webhook handler, updates invoice status to "paid" when paid in QBO
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // --- Intuit HMAC-SHA256 signature verification ---
  const rawBody = await req.text();
  const intuitSignature = req.headers.get('intuit-signature');
  const webhookToken = Deno.env.get('QUICKBOOKS_WEBHOOK_TOKEN');

  if (!webhookToken) {
    console.warn('[quickbooksWebhook] QUICKBOOKS_WEBHOOK_TOKEN is not set, skipping signature verification (dev/pre-production mode)');
  } else {
    if (!intuitSignature) {
      return secureJson({ error: 'Invalid signature' }, { status: 401 });
    }

    const encoder = new TextEncoder();
    const keyData = encoder.encode(webhookToken);
    const msgData = encoder.encode(rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    if (computedSignature !== intuitSignature) {
      return secureJson({ error: 'Invalid signature' }, { status: 401 });
    }
  }
  // --- End signature verification ---

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  if (!body) return new Response('Bad Request', { status: 400 });

  const entities = body?.eventNotifications?.[0]?.dataChangeEvent?.entities || [];

  for (const entity of entities) {
    if (entity.name === 'Invoice' && entity.operation === 'Update') {
      const qbInvoiceId = entity.id;
      // Find matching invoice in our app
      const invoices = await base44.asServiceRole.entities.Invoice.list();
      const match = invoices.find(inv => inv.quickbooks_invoice_id === qbInvoiceId);
      if (match && match.status !== 'paid') {
        // Fetch full invoice from QBO to check balance
        const settingsList = await base44.asServiceRole.entities.QBOIntegrationSettings.list();
        const settings = settingsList[0];
        if (settings?.is_connected && settings.access_token) {
          const qboRes = await fetch(`https://quickbooks.api.intuit.com/v3/company/${settings.realm_id}/invoice/${qbInvoiceId}?minorversion=65`, {
            headers: {
              'Authorization': `Bearer ${settings.access_token}`,
              'Accept': 'application/json',
            },
          });
          if (qboRes.ok) {
            const data = await qboRes.json();
            const qbInvoice = data?.Invoice;
            if (qbInvoice && qbInvoice.Balance === 0 && qbInvoice.EmailStatus !== 'NeedToSend') {
              await base44.asServiceRole.entities.Invoice.update(match.id, { status: 'paid' });
            }
          }
        }
      }
    }
  }

  return new Response('OK', { status: 200 });
});