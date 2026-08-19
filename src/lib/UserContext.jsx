import { createContext, useContext, useEffect, useState } from 'react';
import { base44, supabase } from '@/api/base44Client';

// Effective billing access for a company. Mirrors company_access_level() in the DB: a paid
// subscription honors its plan; an app-managed trial (trial_ends_at in the future) grants full Pro;
// otherwise the tenant is on the free floor (projects + timecards only).
const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];
function computeBilling(row) {
  if (!row) return { plan: 'field', access_level: 'none', is_pro: false, has_field: false, on_trial: false, trial_days_left: 0 };
  const now = Date.now();
  const trialEnd = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
  const trialActive = trialEnd > now;
  let access = 'none';
  if (ACTIVE_STATUSES.includes(row.subscription_status)) access = row.plan || 'field';
  else if (trialActive) access = 'pro';
  const onTrial = trialActive && !ACTIVE_STATUSES.includes(row.subscription_status);
  return {
    plan: row.plan || 'field',
    subscription_status: row.subscription_status || 'none',
    access_level: access,
    is_pro: access === 'pro',
    has_field: access === 'field' || access === 'pro',
    on_trial: onTrial,
    trial_days_left: onTrial ? Math.max(0, Math.ceil((trialEnd - now) / 86400000)) : 0,
  };
}

async function loadBilling(companyId) {
  if (!companyId) return computeBilling(null);
  try {
    const { data } = await supabase.from('companies').select('plan, subscription_status, trial_ends_at').eq('id', companyId).maybeSingle();
    return computeBilling(data);
  } catch { return computeBilling(null); }
}

async function loadBranding(companyId) {
  if (!companyId) return {};
  try {
    const { data } = await supabase.from('company_settings')
      .select('brand_primary, brand_accent, logo_url, brand_font, brand_theme').eq('company_id', companyId).maybeSingle();
    if (!data) return {};
    return {
      primary: data.brand_primary || null,
      accent: data.brand_accent || null,
      logo_url: data.logo_url || null,
      font: data.brand_font || null,
      default_theme: data.brand_theme || null,
    };
  } catch { return {}; }
}
import { queryClientInstance } from '@/lib/query-client';

const UserContext = createContext(null);

async function loadEnrichedUser() {
  const user = await base44.auth.me();
  if (!user) return null;
  try {
    let profiles = await base44.entities.UserProfile.filter({ user_id: user.id });
    // Auto-create profile for new signups who don't have one yet
    if (!profiles || profiles.length === 0) {
      const nameParts = (user.full_name || '').split(' ');
      const defaultRole = user.email === 'simplyflippin@gmail.com' ? 'owner' : 'admin';
      const created = await base44.entities.UserProfile.create({
        user_id: user.id,
        email: user.email || '',
        full_name: user.full_name || '',
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        role: defaultRole,
        assigned_project_ids: [],
        notify_task_assigned: false,
      });
      profiles = [created];
    }
    if (profiles && profiles.length > 0) {
      const p = profiles[0];
      const computedName = [p.first_name, p.last_name].filter(Boolean).join(' ');
      const [billing, branding] = await Promise.all([loadBilling(p.company_id), loadBranding(p.company_id)]);
      return {
        ...user,
        branding,
        role: p.role || user.role,
        first_name: p.first_name || user.first_name,
        last_name: p.last_name || user.last_name,
        // Prefer the computed first+last name so it matches subtask assignment strings
        full_name: computedName || p.full_name || user.full_name,
        assigned_project_ids: p.assigned_project_ids || [],
        custom_role_id: p.custom_role_id || null,
        role_label: p.role_label || null,
        profile_id: p.id,
        theme: p.theme || 'light',
        is_platform_admin: p.is_platform_admin === true,
        ...billing,
      };
    }
  } catch (e) {
    // RLS may block the filter call, retry with list() and filter client-side
    console.error('UserProfile filter failed, retrying with list():', e);
    try {
      const allProfiles = await base44.entities.UserProfile.list();
      const profiles = allProfiles.filter(p => p.user_id === user.id);
      if (profiles && profiles.length > 0) {
        const p = profiles[0];
        const computedName = [p.first_name, p.last_name].filter(Boolean).join(' ');
        const [billing, branding] = await Promise.all([loadBilling(p.company_id), loadBranding(p.company_id)]);
        return {
          ...user,
          branding,
          role: p.role || user.role,
          first_name: p.first_name || user.first_name,
          last_name: p.last_name || user.last_name,
          full_name: computedName || p.full_name || user.full_name,
          assigned_project_ids: p.assigned_project_ids || [],
          custom_role_id: p.custom_role_id || null,
          role_label: p.role_label || null,
          profile_id: p.id,
          theme: p.theme || 'light',
          is_platform_admin: p.is_platform_admin === true,
          ...billing,
        };
      }
    } catch (retryError) {
      console.error('UserProfile list retry also failed:', retryError);
    }
  }
  return user;
}

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const CACHE_KEY = 'gw_cached_user_v1';
    const hydrateFromCache = () => {
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached) setCurrentUser(cached);
      } catch { /* ignore */ }
    };
    loadEnrichedUser().then(user => {
      if (user && user.role) {
        setCurrentUser(user);
        // Cache the enriched user so the app still boots offline (crew can clock in with no signal).
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(user)); } catch { /* quota */ }
        queryClientInstance.invalidateQueries();
      } else if (!navigator.onLine) {
        hydrateFromCache(); // offline: fall back to the last known user
      } else {
        setCurrentUser(user || null);
        if (!user) { try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ } } // signed out
      }
      setLoading(false);
    }).catch(() => {
      if (!navigator.onLine) hydrateFromCache();
      setLoading(false);
    });
  }, []);

  const refreshUser = async () => {
    const user = await loadEnrichedUser();
    setCurrentUser(user);
    return user;
  };

  return (
    <UserContext.Provider value={{ currentUser, loading, refreshUser, setCurrentUser }}>
      {children}
    </UserContext.Provider>
  );
}

export const useCurrentUser = () => useContext(UserContext);