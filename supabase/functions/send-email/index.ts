// send-email: send transactional email via Resend. JWT-verified so only authenticated
// tenant users can send. The domain part of "from" is always guildwright.app (verified);
// callers only supply the display name and reply-to, so tenants can't spoof other domains.
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_DOMAIN = Deno.env.get("EMAIL_FROM_DOMAIN") ?? "guildwright.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

const clean = (s: string) => (s ?? "").replace(/[<>\r\n]/g, "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!RESEND_API_KEY) return json({ error: "Email is not configured yet (missing API key)." }, 503);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);

    const { to, subject, html, from_name, reply_to } = await req.json().catch(() => ({}));
    if (!to || !subject || !html) return json({ error: "to, subject, and html are required" }, 400);

    const from = `${clean(from_name) || "GuildWright"} <noreply@${EMAIL_DOMAIN}>`;
    const payload: Record<string, unknown> = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };
    if (reply_to) payload.reply_to = reply_to;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ error: data?.message || `Email send failed (${resp.status})` }, 502);
    return json({ id: data?.id, sent: true });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
