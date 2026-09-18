import { useState, useEffect } from 'react';
import { supabase, base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Receipt, Loader2, Check, FileText } from 'lucide-react';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import SettingsBack from '@/components/shared/SettingsBack';

// Friendly named styles. "Custom" reveals the raw template for power users.
const STYLES = [
  { key: 'prefix_dash', label: 'Site + number', example: '4325Maple-001', template: '{prefix}-{seq:3}' },
  { key: 'prefix_underscore', label: 'Site _ number', example: '4325Maple_001', template: '{prefix}_{seq:3}' },
  { key: 'prefix_dash4', label: 'Site + 4-digit number', example: '4325Maple-0001', template: '{prefix}-{seq:4}' },
  { key: 'year_number', label: 'Year + number', example: '2026-0001', template: '{yyyy}-{seq:4}' },
  { key: 'simple', label: 'Simple sequence', example: 'INV-0001', template: 'INV-{seq:4}' },
  { key: 'custom', label: 'Custom', example: 'Advanced', template: null },
];

export default function InvoiceSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState(null);
  const [styleKey, setStyleKey] = useState('prefix_underscore');
  const [customFormat, setCustomFormat] = useState('{prefix}_{seq:3}');
  const [seqStart, setSeqStart] = useState(1);
  const [paymentScheduleText, setPaymentScheduleText] = useState('');
  const [estimateTerms, setEstimateTerms] = useState('');
  const [savingEst, setSavingEst] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: cs } = await supabase.from('company_settings')
          .select('company_id, invoice_number_format, invoice_seq_start, payment_schedule, estimate_terms').maybeSingle();
        if (cs) {
          setCompanyId(cs.company_id);
          const fmt = cs.invoice_number_format || '{prefix}_{seq:3}';
          setSeqStart(cs.invoice_seq_start ?? 1);
          const match = STYLES.find(s => s.template === fmt);
          setStyleKey(match ? match.key : 'custom');
          setCustomFormat(fmt);
          setPaymentScheduleText((cs.payment_schedule || []).join('\n'));
          setEstimateTerms(cs.estimate_terms || '');
        } else {
          const companies = await base44.entities.Company.list();
          setCompanyId(companies?.[0]?.id || null);
        }
      } catch (e) { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const activeTemplate = styleKey === 'custom' ? customFormat : (STYLES.find(s => s.key === styleKey)?.template || '{prefix}_{seq:3}');
  const preview = formatInvoiceNumber(activeTemplate, { prefix: '4325Maple', seq: Number(seqStart) || 1, projectName: 'Maple Remodel' });

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('company_settings').upsert(
        { company_id: companyId, invoice_number_format: activeTemplate, invoice_seq_start: Number(seqStart) || 1 },
        { onConflict: 'company_id' }
      );
      if (error) throw error;
      toast({ title: 'Invoice numbering saved' });
    } catch (e) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const saveEstimateDefaults = async () => {
    if (!companyId) return;
    setSavingEst(true);
    try {
      const lines = paymentScheduleText.split('\n').map(l => l.trim()).filter(Boolean);
      const { error } = await supabase.from('company_settings').upsert(
        { company_id: companyId, payment_schedule: lines, estimate_terms: estimateTerms.trim() || null },
        { onConflict: 'company_id' }
      );
      if (error) throw error;
      toast({ title: 'Estimate defaults saved' });
    } catch (e) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally { setSavingEst(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-5">
      <SettingsBack />
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
          <Receipt className="w-7 h-7" /> Invoice Numbering
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Pick how your invoice numbers look. Each project counts its own invoices, so 4325 Maple and 732 Jean number independently.</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-5">
        <div>
          <Label className="mb-2 block">Numbering style</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STYLES.map(s => {
              const active = styleKey === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStyleKey(s.key)}
                  className={`flex items-center justify-between text-left px-3 py-2.5 rounded-md border transition-all ${active ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'}`}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.label}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{s.example}</p>
                  </div>
                  {active && <Check className="w-4 h-4 text-accent shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {styleKey === 'custom' && (
          <div>
            <Label>Custom format</Label>
            <Input value={customFormat} onChange={e => setCustomFormat(e.target.value)} className="font-mono" placeholder="{prefix}_{seq:3}" />
            <p className="text-xs text-muted-foreground mt-1.5">
              Tokens: <code className="text-accent">{'{prefix}'}</code> per-project prefix · <code className="text-accent">{'{seq}'}</code> / <code className="text-accent">{'{seq:3}'}</code> number (zero-padded) · <code className="text-accent">{'{project}'}</code> · <code className="text-accent">{'{yyyy}'}</code>
            </p>
          </div>
        )}

        <div>
          <Label>Start numbering at</Label>
          <Input type="number" min="0" value={seqStart} onChange={e => setSeqStart(e.target.value)} className="w-32" />
          <p className="text-xs text-muted-foreground mt-1.5">Each project's first invoice starts here.</p>
        </div>

        <div className="rounded-md bg-muted/40 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your invoices will look like</p>
          <p className="font-mono text-lg text-foreground">{preview || '—'}</p>
        </div>

        <Button onClick={save} disabled={saving || !companyId} className="gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        The "site" part (like 4325Maple) comes from each project's Invoice Prefix, auto-suggested from its address when you create it (Projects, edit, Invoice Prefix).
      </p>

      <div className="pt-2">
        <h2 className="text-xl font-bold text-primary flex items-center gap-2">
          <FileText className="w-6 h-6" /> Estimate defaults
        </h2>
        <p className="text-sm text-muted-foreground mt-1">The payment schedule and terms shown on your estimates. These appear on the client-facing estimate and signature page.</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-5">
        <div>
          <Label>Payment schedule</Label>
          <Textarea
            value={paymentScheduleText}
            onChange={e => setPaymentScheduleText(e.target.value)}
            rows={4}
            placeholder={"25% due at project start to secure scheduling and materials.\nProgress draws due at substantial completion of each major project phase.\nFinal balance due upon project completion and client walkthrough."}
          />
          <p className="text-xs text-muted-foreground mt-1.5">One line per bullet. Leave blank to use the standard schedule.</p>
        </div>
        <div>
          <Label>Terms &amp; conditions</Label>
          <Textarea
            value={estimateTerms}
            onChange={e => setEstimateTerms(e.target.value)}
            rows={4}
            placeholder="This estimate is valid for 30 days from date of issue…"
          />
        </div>
        <Button onClick={saveEstimateDefaults} disabled={savingEst || !companyId} className="gap-2">
          {savingEst && <Loader2 className="w-4 h-4 animate-spin" />} Save
        </Button>
      </div>
    </div>
  );
}
