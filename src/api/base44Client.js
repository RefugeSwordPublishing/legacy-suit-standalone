// GuildWright data layer.
// A drop-in replacement for the Base44 SDK that talks to Supabase instead.
// The rest of the app keeps calling base44.entities.X.list()/.filter()/.create()/etc.
// Tenancy is transparent: tables default company_id to auth_company_id() and RLS
// filters by tenant, so components never deal with company_id directly.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Entity name -> Postgres table name.
const TABLES = {
  Project: 'projects',
  Task: 'tasks',
  TaskTemplate: 'task_templates',
  TimeEntry: 'time_entries',
  TimecardAdjustment: 'timecard_adjustments',
  TimeOffRequest: 'time_off_requests',
  UserProfile: 'user_profiles',
  User: 'user_profiles',
  Notification: 'notifications',
  SubContractor: 'sub_contractors',
  Material: 'materials',
  Estimate: 'estimates',
  EstimateTemplate: 'estimate_templates',
  Client: 'clients',
  ClientChangeOrder: 'client_change_orders',
  ClientRequest: 'client_requests',
  ChangeOrder: 'sub_change_orders',
  CostCode: 'cost_codes',
  ExpenseCategory: 'expense_categories',
  CustomRole: 'custom_roles',
  CatalogItem: 'catalog_items',
  DailyGoal: 'daily_goals',
  ProjectFile: 'project_files',
  PhaseApprovalRequest: 'phase_approval_requests',
  BidRequest: 'bid_requests',
  BidSubmission: 'bid_submissions',
  CrewScheduleEntry: 'crew_schedule_entries',
  Invoice: 'invoices',
  Expense: 'expenses',
  PayRate: 'pay_rates',
  SupportTicket: 'support_tickets',
  ChatMessage: 'chat_messages',
  PermissionSettings: 'permission_settings',
  QBOIntegrationSettings: 'qbo_integration_settings',
  Company: 'companies',
  Membership: 'memberships',
  CompanySettings: 'company_settings',
};

// Base44 uses created_date/updated_date; our tables use created_at. Map field names
// on sort, and alias created_at back to created_date/updated_date on read, so the
// ported components (which use the Base44 field names) keep working unchanged.
function mapField(col) {
  return (col === 'created_date' || col === 'updated_date') ? 'created_at' : col;
}
function applySort(query, sort) {
  if (!sort) return query;
  const desc = sort.startsWith('-');
  const col = mapField(desc ? sort.slice(1) : sort);
  return query.order(col, { ascending: !desc });
}
function withAliases(row) {
  if (row && typeof row === 'object' && 'created_at' in row) {
    return { ...row, created_date: row.created_date ?? row.created_at, updated_date: row.updated_date ?? row.created_at };
  }
  return row;
}
function mapRows(data) {
  return (data || []).map(withAliases);
}

// Sanitize a record before writing to Postgres:
//  - Drop the read-only aliases withAliases() adds on read (created_date/updated_date).
//    Edit forms often spread a fetched record back into the payload; these aren't real
//    columns and would fail the write with "column does not exist".
//  - Coerce empty strings ('' -> null) for uuid, date, and timestamp columns. Postgres rejects
//    '' for these types, and forms leave optional ones empty when unset (project_id when
//    standalone, due_date with no date picked, clock_out on an open shift). Without this the
//    write throws and any handler lacking try/finally gets stuck on "Saving...".
const isNullableEmptyKey = (k) =>
  k === 'id' || k.endsWith('_id') || k === 'date' || k.endsWith('_date') || k.endsWith('_at') ||
  // Other date/timestamp/int columns that also reject '' (phase_since, eta_start/end, break_start/end, invoice_seq_start).
  k.endsWith('_since') || k.endsWith('_start') || k.endsWith('_end');

function coerceEmptyIds(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'created_date' || k === 'updated_date') continue;
    out[k] = (v === '' && isNullableEmptyKey(k)) ? null : v;
  }
  return out;
}

function entity(table) {
  return {
    async list(sort, limit) {
      let q = supabase.from(table).select('*');
      q = applySort(q, sort);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return mapRows(data);
    },
    async filter(criteria = {}, sort, limit) {
      let q = supabase.from(table).select('*').match(criteria);
      q = applySort(q, sort);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return mapRows(data);
    },
    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return withAliases(data);
    },
    async create(obj) {
      const { data, error } = await supabase.from(table).insert(coerceEmptyIds(obj)).select().single();
      if (error) throw error;
      return withAliases(data);
    },
    async bulkCreate(rows) {
      const { data, error } = await supabase.from(table).insert((rows || []).map(coerceEmptyIds)).select();
      if (error) throw error;
      return mapRows(data);
    },
    async update(id, obj) {
      const { data, error } = await supabase.from(table).update(coerceEmptyIds(obj)).eq('id', id).select().single();
      if (error) throw error;
      return withAliases(data);
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    },
    // Realtime: fires the callback on any insert/update/delete for this table (RLS-scoped).
    subscribe(callback) {
      const channel = supabase
        .channel(`rt:${table}:${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          try { callback(payload); } catch (e) { console.error('subscribe callback error', e); }
        })
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
}

const entities = new Proxy({}, {
  get(_target, name) {
    const table = TABLES[name];
    if (!table) {
      console.warn(`[data] Unknown entity "${String(name)}" - add it to TABLES in base44Client.js`);
      return entity(String(name).toLowerCase());
    }
    return entity(table);
  },
});

async function me() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email,
    full_name: meta.full_name || meta.name || '',
    first_name: meta.first_name || '',
    last_name: meta.last_name || '',
  };
}

async function logout() {
  await supabase.auth.signOut();
}

// Update the current user's profile row (notification prefs, etc.). Matches by user_id and does
// NOT use .single(), so it never throws "Cannot coerce the result to a single JSON object".
async function updateMe(fields) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  const { error } = await supabase.from('user_profiles').update(coerceEmptyIds(fields)).eq('user_id', user.id);
  if (error) throw error;
  return { success: true };
}

// Edge functions. The e-signature flow (client-facing estimate/change-order
// signing) is wired to SECURITY DEFINER RPCs; the rest (QBO sync, email, sheets)
// stay deferred and stubbed.
async function invoke(name, payload = {}) {
  try {
    if (name === 'getPublicEstimate') {
      const { data, error } = await supabase.rpc('get_public_estimate', { p_id: payload.estimateId });
      if (error) return { data: { error: error.message } };
      const row = Array.isArray(data) ? data[0] : data;
      return { data: row ? { estimate: withAliases(row) } : { error: 'Estimate not found' } };
    }
    if (name === 'getPublicChangeOrder') {
      const { data, error } = await supabase.rpc('get_public_change_order', { p_id: payload.changeOrderId });
      if (error) return { data: { error: error.message } };
      const row = Array.isArray(data) ? data[0] : data;
      return { data: row ? { changeOrder: withAliases(row) } : { error: 'Change order not found' } };
    }
    if (name === 'saveEstimateSignature') {
      const { error } = await supabase.rpc('sign_estimate', { p_id: payload.estimateId, p_signed_by: payload.signedBy, p_signed_at: payload.signedAt });
      if (error) return { data: { error: error.message } };
      return { data: { success: true } };
    }
    if (name === 'saveChangeOrderSignature') {
      const { error } = await supabase.rpc('sign_change_order', { p_id: payload.changeOrderId, p_signed_by: payload.signedBy, p_signed_at: payload.signedAt });
      if (error) return { data: { error: error.message } };
      return { data: { success: true } };
    }
    if (name === 'sendEmail') {
      const { data, error } = await supabase.functions.invoke('send-email', { body: payload });
      if (error) return { data: { error: error.message } };
      return { data };
    }
    if (name === 'quickbooksAuth') {
      const { data, error } = await supabase.functions.invoke('quickbooks-auth', { body: payload });
      if (error) return { data: { error: error.message } };
      return { data };
    }
    if (name === 'quickbooksSyncV2') {
      const { data, error } = await supabase.functions.invoke('quickbooks-sync', { body: payload });
      if (error) {
        // supabase-js hides the function's response body in error.context; surface the real reason.
        let detail = error.message;
        try { const body = await error.context?.json?.(); if (body?.error) detail = body.error; } catch { /* ignore */ }
        return { data: { error: detail } };
      }
      return { data };
    }
    if (name === 'platformAdmin') {
      const { data, error } = await supabase.functions.invoke('platform-admin', { body: payload });
      if (error) return { data: { error: error.message } };
      return { data };
    }
    if (name === 'xeroAuth') {
      const { data, error } = await supabase.functions.invoke('xero-auth', { body: payload });
      if (error) return { data: { error: error.message } };
      return { data };
    }
    if (name === 'xeroSyncV2') {
      const { data, error } = await supabase.functions.invoke('xero-sync', { body: payload });
      if (error) {
        let detail = error.message;
        try { const body = await error.context?.json?.(); if (body?.error) detail = body.error; } catch { /* ignore */ }
        return { data: { error: detail } };
      }
      return { data };
    }
    if (name === 'gustoAuth') {
      const { data, error } = await supabase.functions.invoke('gusto-auth', { body: payload });
      if (error) return { data: { error: error.message } };
      return { data };
    }
    if (name === 'gustoSyncV2') {
      const { data, error } = await supabase.functions.invoke('gusto-sync', { body: payload });
      if (error) {
        let detail = error.message;
        try { const body = await error.context?.json?.(); if (body?.error) detail = body.error; } catch { /* ignore */ }
        return { data: { error: detail } };
      }
      return { data };
    }
    if (name === 'stripeBilling') {
      const { data, error } = await supabase.functions.invoke('stripe-billing', { body: payload });
      if (error) {
        let detail = error.message;
        try { const body = await error.context?.json?.(); if (body?.error) detail = body.error; } catch { /* ignore */ }
        return { data: { error: detail } };
      }
      return { data };
    }
  } catch (e) {
    return { data: { error: e.message || String(e) } };
  }
  console.warn(`[data] functions.invoke('${name}') is not wired yet (deferred).`, payload);
  return { data: null, deferred: true };
}

// File upload -> Supabase Storage 'uploads' bucket.
async function UploadFile({ file }) {
  const path = `${Date.now()}-${(file.name || 'file').replace(/[^\w.\-]/g, '_')}`;
  const { error } = await supabase.storage.from('uploads').upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('uploads').getPublicUrl(path);
  return { file_url: data.publicUrl };
}

// Vision/text LLM (receipt extraction, etc.) via the invoke-llm edge function.
async function InvokeLLM(payload) {
  const { data, error } = await supabase.functions.invoke('invoke-llm', { body: payload });
  if (error) {
    // supabase-js hides the function's response body in error.context; surface it.
    let detail = error.message;
    try { const body = await error.context?.json?.(); if (body?.error) detail = body.error; } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

export const base44 = {
  entities,
  auth: { me, logout, updateMe },
  functions: { invoke },
  integrations: { Core: { UploadFile, InvokeLLM } },
  users: {
    async inviteUser() {
      console.warn('[data] users.inviteUser is deferred; provision users in Supabase for now.');
      return { deferred: true };
    },
  },
};
