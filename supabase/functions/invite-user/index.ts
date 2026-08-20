// Invite a user into the caller's tenant. The browser can't do this (it needs the service role to
// create an auth user + send the invite email), so it runs here. Sends a set-password email via the
// configured Resend SMTP, then creates the membership (auth_company_id() reads this) and the
// user_profile with the assigned role. Gated to owner/admin/coo of the caller's own company.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REDIRECT = 'https://app.guildwright.app/reset-password';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (d: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(d), { ...init, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

  // Who is calling? Company + role come from memberships (the same source auth_company_id/auth_role use).
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
  const { data: mem } = await admin.from('memberships').select('company_id, role').eq('user_id', user.id).maybeSingle();
  if (!mem) return json({ error: 'Your account is not linked to a company.' }, { status: 403 });
  if (!['owner', 'admin', 'coo'].includes(mem.role)) {
    return json({ error: 'Only an owner, admin, or COO can invite users.' }, { status: 403 });
  }
  const companyId = mem.company_id;

  const body = await req.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  const firstName = (body.first_name || '').trim();
  const lastName = (body.last_name || '').trim();
  const role = (body.role || 'crew_member').trim();        // base role
  const roleLabel = (body.role_label || '').trim() || null;
  const customRoleId = body.custom_role_id || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'A valid email address is required.' }, { status: 400 });
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  // Don't re-invite someone who already has an account (the app treats one user as one company).
  const { data: existingProfiles } = await admin.from('user_profiles').select('id').eq('email', email).limit(1);
  if (existingProfiles && existingProfiles.length) {
    return json({ error: 'That email is already in use by an existing user.' }, { status: 409 });
  }

  // 1. Create the auth user + send the set-password invite email (Resend SMTP).
  const { data: invite, error: iErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: REDIRECT, data: { full_name: fullName },
  });
  if (iErr || !invite?.user) {
    const msg = (iErr as Error)?.message || 'invite failed';
    const friendly = /already been registered|already exists/i.test(msg)
      ? 'That email already has a GuildWright login.'
      : `Could not send the invite email: ${msg}`;
    return json({ error: friendly }, { status: 400 });
  }
  const userId = invite.user.id;

  // 2. Membership so auth_company_id() resolves their company. 3. Profile with the assigned role.
  const { error: memErr } = await admin.from('memberships').insert({ user_id: userId, company_id: companyId, role });
  if (memErr) return json({ error: `Invite sent, but linking the user failed: ${memErr.message}` }, { status: 400 });

  const { error: pErr } = await admin.from('user_profiles').insert({
    user_id: userId, company_id: companyId, role, role_label: roleLabel, custom_role_id: customRoleId,
    email, first_name: firstName, last_name: lastName, full_name: fullName, is_active: true,
  });
  if (pErr) return json({ error: `Invite sent, but saving the profile failed: ${pErr.message}` }, { status: 400 });

  return json({ ok: true, user_id: userId, email });
});
