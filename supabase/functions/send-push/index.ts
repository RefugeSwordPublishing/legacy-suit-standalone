// send-push: deliver a notification to a set of users' subscribed devices. Web devices get a VAPID
// Web Push; native Android devices get an FCM (HTTP v1) push. Called by DB triggers (with the
// x-push-secret shared secret) for real events, or by the app (with a user JWT) for a test-to-self.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:dustin@legacyrenovationssgf.com";
const PUSH_SECRET = Deno.env.get("PUSH_TRIGGER_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FIREBASE_SA = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ── FCM HTTP v1 ──────────────────────────────────────────────────────────────
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s));
function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}
// deno-lint-ignore no-explicit-any
async function fcmAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64urlStr(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const input = `${header}.${claim}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  const jwt = `${input}.${b64url(new Uint8Array(sig))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("FCM token exchange failed: " + JSON.stringify(data));
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const { user_ids, title, body: message, url, tag } = body;

    const secret = req.headers.get("x-push-secret") ?? "";
    let targetIds: string[] = Array.isArray(user_ids) ? user_ids : [];
    if (!(PUSH_SECRET && secret === PUSH_SECRET)) {
      const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      const { data: u, error: uErr } = await admin.auth.getUser(token);
      if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);
      targetIds = [u.user.id];
    }
    if (targetIds.length === 0) return json({ error: "no targets" }, 400);

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, type")
      .in("user_id", targetIds);
    if (error) throw error;

    const titleTxt = title || "GuildWright";
    const bodyTxt = message || "";
    const urlTxt = url || "/";
    const tagTxt = tag || "guildwright";

    let sent = 0, removed = 0;

    // Web Push (VAPID).
    const webSubs = (subs ?? []).filter((s: any) => (s.type ?? "web") === "web");
    const webPayload = JSON.stringify({ title: titleTxt, body: bodyTxt, url: urlTxt, tag: tagTxt });
    await Promise.all(webSubs.map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, webPayload);
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) { await admin.from("push_subscriptions").delete().eq("id", s.id); removed++; }
      }
    }));

    // Native push (FCM HTTP v1).
    const fcmSubs = (subs ?? []).filter((s: any) => s.type === "fcm");
    if (fcmSubs.length && FIREBASE_SA) {
      const sa = JSON.parse(FIREBASE_SA);
      const accessToken = await fcmAccessToken(sa);
      const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
      await Promise.all(fcmSubs.map(async (s: any) => {
        const res = await fetch(endpoint, {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: {
            token: s.endpoint,
            notification: { title: titleTxt, body: bodyTxt },
            data: { url: String(urlTxt), tag: String(tagTxt) },
            android: { priority: "HIGH" },
          } }),
        });
        if (res.ok) { sent++; return; }
        // A 404 (UNREGISTERED) means the token is dead; drop it.
        if (res.status === 404) { await admin.from("push_subscriptions").delete().eq("id", s.id); removed++; }
      }));
    }

    return json({ sent, removed, targets: subs?.length ?? 0 });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
