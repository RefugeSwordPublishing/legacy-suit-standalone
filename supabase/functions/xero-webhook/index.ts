// Xero webhook receiver. Xero calls this (no Supabase JWT) when invoices change in a connected org.
// We verify the x-xero-signature (HMAC-SHA256, base64, of the raw body using the webhook signing key),
// and for any changed Invoice we fetch it from Xero; if its Status is PAID we flip the matching
// GuildWright invoice to 'paid'. This closes the loop: build invoice -> push to Xero -> client pays
// in Xero -> status syncs back. Mirrors quickbooks-webhook.
//
// Xero's "intent to receive" validation posts here right after you save the delivery URL: a valid
// signature must return 200, an invalid one 401, within 5 seconds. Deploy with --no-verify-jwt.
// Requires env XERO_WEBHOOK_KEY (the signing key from the app's Webhooks tab) plus the
// XERO_CLIENT_ID/SECRET already used by xero-sync.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('XERO_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET') ?? '';
const WEBHOOK_KEY = Deno.env.get('XERO_WEBHOOK_KEY') ?? '';
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

// Verify Xero's HMAC-SHA256 signature (base64) of the raw body using the signing key.
async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  if (!WEBHOOK_KEY || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(WEBHOOK_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // Constant-ish time compare.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');

  const rawBody = await req.text();
  const signature = req.headers.get('x-xero-signature') ?? '';
  // Signature check gates both the intent-to-receive validation and real deliveries.
  if (!(await verifySignature(rawBody, signature))) {
    return new Response('unauthorized', { status: 401 });
  }

  // Valid signature. Process events but always 200 so Xero doesn't retry-storm.
  try {
    const payload = JSON.parse(rawBody || '{}');
    const events = payload.events ?? [];
    if (events.length) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      // Group invoice ids by tenant so we refresh each org's token once.
      const byTenant = new Map<string, Set<string>>();
      for (const ev of events) {
        if ((ev.eventCategory || '').toUpperCase() !== 'INVOICE') continue;
        if (!ev.tenantId || !ev.resourceId) continue;
        if (!byTenant.has(ev.tenantId)) byTenant.set(ev.tenantId, new Set());
        byTenant.get(ev.tenantId)!.add(String(ev.resourceId));
      }

      for (const [tenantId, ids] of byTenant.entries()) {
        const { data: settings } = await admin.from('xero_integration_settings')
          .select('*').eq('tenant_id', tenantId).maybeSingle();
        if (!settings?.is_connected) continue;

        let token: string;
        try { token = await validToken(admin, settings); } catch { continue; }

        for (const id of ids) {
          try {
            const res = await fetch(`${API}/Invoices/${id}`, {
              headers: { 'Authorization': `Bearer ${token}`, 'Xero-tenant-id': tenantId, 'Accept': 'application/json' },
            });
            if (!res.ok) continue;
            const data = await res.json();
            const inv = data?.Invoices?.[0];
            if (!inv) continue;
            if (String(inv.Status).toUpperCase() === 'PAID') {
              await admin.from('invoices')
                .update({ status: 'paid', paid_at: inv.FullyPaidOnDate || new Date().toISOString() })
                .eq('company_id', settings.company_id)
                .eq('xero_invoice_id', id);
            }
          } catch (_e) { /* skip this invoice, keep going */ }
        }
      }
    }
  } catch (_e) { /* swallow; still 200 */ }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
