import { supabase } from '@/api/base44Client';

// Record an error to the error_logs table. Best-effort: it must never throw or
// interrupt the flow that called it. Admins/owners view these on the Error Log page,
// and the developer can query the table directly for any tenant.
export async function logError(source, error, details = {}) {
  try {
    const message = (error?.message || String(error || 'Unknown error')).slice(0, 1000);
    await supabase.from('error_logs').insert({
      source: String(source || 'unknown').slice(0, 80),
      message,
      details: { ...details, stack: error?.stack ? String(error.stack).slice(0, 2000) : undefined },
      url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch (_) {
    // swallow — logging failures must not surface
  }
}
