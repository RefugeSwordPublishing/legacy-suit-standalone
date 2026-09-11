import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/base44Client';

// Per-tenant company branding for client-facing docs. Reads company_settings (RLS-scoped to the
// tenant). Any field left null falls back to the Legacy defaults so existing docs never render
// blank. For the PUBLIC (unauthenticated) estimate/change-order pages, branding comes from the
// public RPC instead — this hook needs a logged-in session.
// Tenant-neutral fallbacks. Each tenant's real values live in their company_settings row
// (Legacy's is seeded, new tenants get theirs at provisioning), so these only fill genuine gaps
// and must never carry one tenant's details onto another's documents.
const DEFAULTS = {
  company_name: 'Your Company',
  tagline: '',
  address_line: '',
  city_state_zip: '',
  phone: '',
  email: '',
  website: '',
  established_label: '',
  logo_url: '/guildwright-icon.png',
  logo_icon_url: null,
  brand_primary: null,
  brand_accent: null,
  // Estimate defaults (generic, tenant-neutral). A tenant's own values override these.
  payment_schedule: [
    '25% due at project start to secure scheduling and materials.',
    'Progress draws due at substantial completion of each major project phase.',
    'Final balance due upon project completion and client walkthrough.',
  ],
  estimate_terms:
    'This estimate is valid for 30 days from date of issue. Prices are subject to change based on material availability. Any work outside the defined scope will be presented as a written change order prior to commencement.',
};

const FIELDS = Object.keys(DEFAULTS).join(',');

export function mergeBranding(row) {
  const b = row || {};
  return Object.fromEntries(
    Object.entries(DEFAULTS).map(([k, v]) => {
      const val = b[k];
      // null/undefined -> default; also treat an empty array (e.g. cleared payment schedule) as default.
      const useDefault = val == null || (Array.isArray(val) && val.length === 0);
      return [k, useDefault ? v : val];
    })
  );
}

export function useBranding() {
  const { data } = useQuery({
    queryKey: ['company-branding'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select(FIELDS).maybeSingle();
      if (error) return null;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  return mergeBranding(data);
}
