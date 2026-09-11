import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Loader2, Send, Eye, List } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import SectionsEditor from '@/components/estimation/SectionsEditor';
import ScopeOfWorkEditor from '@/components/estimation/ScopeOfWorkEditor';
import ChangeOrderSummaryPanel from '@/components/change-orders/ChangeOrderSummaryPanel';
import LinkEstimateDialog from '@/components/change-orders/LinkEstimateDialog';

const STATUS_COLORS = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

function calcTotals(sections, gcFeeEnabled, gcFeePct) {
  const items = (sections || []).flatMap(s => s.line_items || []);
  const lineTotal = items.reduce((s, i) => s + (i.line_total || 0), 0);
  const gcFeeAmount = gcFeeEnabled ? lineTotal * ((gcFeePct || 0) / 100) : 0;
  return lineTotal + gcFeeAmount;
}

export default function ChangeOrderBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const [form, setForm] = useState({
    title: 'New Change Order',
    status: 'draft',
    estimate_id: '',
    estimate_number: '',
    project_id: '',
    project_name: '',
    client_id: '',
    client_name: '',
    client_email: '',
    original_estimate_total: 0,
    original_estimate_gc_fee: false,
    change_order_number: '',
    date_issued: new Date().toISOString().split('T')[0],
    valid_through: '',
    scope_of_work: '',
    sections: [],
    gc_fee_enabled: true,
    gc_fee_pct: 13,
    gc_fee_label: 'GC / Project Management Fee',
    notes: '',
    change_order_total: 0,
    new_contract_total: 0,
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ['change-order', id],
    queryFn: () => base44.entities.ClientChangeOrder.get(id),
  });

  // Always fetch the linked estimate so we can recalculate original_estimate_total fresh
  const { data: linkedEstimate } = useQuery({
    queryKey: ['linked-estimate', existing?.estimate_id],
    queryFn: () => base44.entities.Estimate.get(existing.estimate_id),
    enabled: !!existing?.estimate_id && existing.estimate_id !== 'pending',
  });

  const { data: allCOs = [] } = useQuery({
    queryKey: ['all-change-orders-count'],
    queryFn: () => base44.entities.ClientChangeOrder.list('-created_date', 1000),
  });

  useEffect(() => {
    if (existing && !initialized) {
      setInitialized(true);
      // If newly created (no estimate linked yet), show the link dialog
      if (!existing.estimate_id || existing.estimate_id === 'pending') {
        setShowLinkDialog(true);
      }
      setForm({
        title: existing.title || 'New Change Order',
        status: existing.status || 'draft',
        estimate_id: existing.estimate_id || '',
        estimate_number: existing.estimate_number || '',
        project_id: existing.project_id || '',
        project_name: existing.project_name || '',
        client_id: existing.client_id || '',
        client_name: existing.client_name || '',
        client_email: existing.client_email || '',
        original_estimate_total: existing.original_estimate_total || 0,
        original_estimate_gc_fee: existing.original_estimate_gc_fee || false,
        change_order_number: existing.change_order_number || '',
        date_issued: existing.date_issued || new Date().toISOString().split('T')[0],
        valid_through: existing.valid_through || '',
        scope_of_work: existing.scope_of_work || '',
        sections: (existing.sections || []).map(s => ({ ...s, line_items: s.line_items || s.items || [] })),
        gc_fee_enabled: existing.gc_fee_enabled ?? true,
        gc_fee_pct: existing.gc_fee_pct ?? 13,
        gc_fee_label: existing.gc_fee_label || 'GC / Project Management Fee',
        notes: existing.notes || '',
        change_order_total: existing.change_order_total || 0,
        new_contract_total: existing.new_contract_total || 0,
      });
    }
  }, [existing, initialized]);

  // Once the linked estimate loads, recalculate original_estimate_total fresh
  // (overrides any stale value stored in the DB before the GC fee fix)
  useEffect(() => {
    if (!linkedEstimate) return;
    const sectionsSubtotal = (linkedEstimate.sections || [])
      .flatMap(s => s.line_items || s.items || [])
      .reduce((sum, i) => sum + (i.line_total || i.total || 0), 0);
    const gcFee = linkedEstimate.gc_fee_enabled
      ? sectionsSubtotal * ((linkedEstimate.gc_fee_pct || 13) / 100)
      : 0;
    const trueTotal = sectionsSubtotal + gcFee;
    setForm(f => {
      const coTotal = calcTotals(f.sections, f.gc_fee_enabled, f.gc_fee_pct);
      return {
        ...f,
        original_estimate_total: trueTotal,
        original_estimate_gc_fee: linkedEstimate.gc_fee_enabled || false,
        new_contract_total: trueTotal + (f.change_order_total || 0),
      };
    });
  }, [linkedEstimate]);

  const handleLinkEstimate = async (estimate) => {
    const sectionsSubtotal = (estimate.sections || [])
      .flatMap(s => s.line_items || s.items || [])
      .reduce((sum, item) => sum + (item.line_total || item.total || 0), 0);
    const gcFee = estimate.gc_fee_enabled
      ? sectionsSubtotal * ((estimate.gc_fee_pct || 13) / 100)
      : 0;
    const trueGrandTotal = sectionsSubtotal + gcFee;

    // Always do a fresh client lookup to get the latest email
    let clientEmail = '';
    if (estimate.client_id) {
      try {
        const client = await base44.entities.Client.get(estimate.client_id);
        clientEmail = client?.email || '';
      } catch (e) { /* ignore */ }
    }
    if (!clientEmail) clientEmail = estimate.client_email || '';

    const patch = {
      estimate_id: estimate.id,
      estimate_number: estimate.estimate_number || '',
      project_id: estimate.project_id || '',
      project_name: estimate.project_name || '',
      client_id: estimate.client_id || '',
      client_name: estimate.client_name || '',
      client_email: clientEmail,
      original_estimate_total: trueGrandTotal,
      original_estimate_gc_fee: estimate.gc_fee_enabled || false,
    };
    setForm(f => ({ ...f, ...patch }));
    setShowLinkDialog(false);
    // Persist immediately
    await base44.entities.ClientChangeOrder.update(id, patch);
    queryClient.invalidateQueries({ queryKey: ['change-order', id] });
    toast({ title: 'Estimate linked' });
  };

  const handleSectionsChange = (sections) => {
    const coTotal = calcTotals(sections, form.gc_fee_enabled, form.gc_fee_pct);
    const newTotal = (form.original_estimate_total || 0) + coTotal;
    setForm(f => ({ ...f, sections, change_order_total: coTotal, new_contract_total: newTotal }));
  };

  const handleGcToggle = (enabled) => {
    const coTotal = calcTotals(form.sections, enabled, form.gc_fee_pct);
    const newTotal = (form.original_estimate_total || 0) + coTotal;
    setForm(f => ({ ...f, gc_fee_enabled: enabled, change_order_total: coTotal, new_contract_total: newTotal }));
  };

  const handleGcPctChange = (pct) => {
    const num = parseFloat(pct) || 0;
    const coTotal = calcTotals(form.sections, form.gc_fee_enabled, num);
    const newTotal = (form.original_estimate_total || 0) + coTotal;
    setForm(f => ({ ...f, gc_fee_pct: num, change_order_total: coTotal, new_contract_total: newTotal }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Auto-assign number if missing
      let coNumber = form.change_order_number;
      if (!coNumber) {
        const idx = (allCOs.findIndex(c => c.id === id) >= 0 ? allCOs.length : allCOs.length + 1);
        coNumber = `CO-${String(idx).padStart(4, '0')}`;
      }
      const payload = { ...form, change_order_number: coNumber };
      await base44.entities.ClientChangeOrder.update(id, payload);
      // Update local state without triggering a refetch that could clobber in-progress edits
      setForm(f => ({ ...f, change_order_number: coNumber }));
      queryClient.invalidateQueries({ queryKey: ['client-change-orders'] });
      toast({ title: 'Change order saved' });
    } finally {
      setSaving(false);
    }
  };

  const resolveClientEmail = async (clientId, clientName, fallback) => {
    if (clientId) {
      try {
        const client = await base44.entities.Client.get(clientId);
        if (client?.email) return client.email;
      } catch (e) { /* ignore */ }
    }
    if (clientName) {
      try {
        const results = await base44.entities.Client.filter({ name: clientName });
        if (results?.[0]?.email) return results[0].email;
      } catch (e) { /* ignore */ }
    }
    return fallback || '';
  };

  const handleSendToClient = async () => {
    setSending(true);
    try {
      // Fresh client email lookup before sending
      const resolvedEmail = await resolveClientEmail(form.client_id, form.client_name, form.client_email);
      if (!resolvedEmail) {
        toast({ title: 'No client email on file', variant: 'destructive' });
        setSending(false);
        return;
      }

      let coNumber = form.change_order_number;
      if (!coNumber) {
        const idx = allCOs.length + 1;
        coNumber = `CO-${String(idx).padStart(4, '0')}`;
      }
      // Persist resolved email along with the rest of the form
      await base44.entities.ClientChangeOrder.update(id, { ...form, change_order_number: coNumber, client_email: resolvedEmail });
      setForm(f => ({ ...f, change_order_number: coNumber, client_email: resolvedEmail }));

      const link = `${window.location.origin}/client-change-order/${id}`;
      let companyName = 'Your contractor';
      let replyTo;
      try {
        const companies = await base44.entities.Company.list();
        companyName = companies?.[0]?.name || companyName;
        const meUser = await base44.auth.me();
        replyTo = meUser?.email;
      } catch { /* ignore */ }
      const total = form.new_contract_total;
      const money = total != null ? `$${Number(total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#262525;max-width:520px;margin:0 auto;line-height:1.6;">
          <p>Hi ${form.client_name || 'there'},</p>
          <p>A change order${form.title ? ` for <strong>${form.title}</strong>` : ''} from ${companyName} is ready for your review${money ? ` — new contract total <strong>${money}</strong>` : ''}.</p>
          <p style="margin:28px 0;">
            <a href="${link}" style="background:#262525;color:#ffffff;padding:13px 26px;text-decoration:none;border-radius:4px;letter-spacing:0.04em;display:inline-block;">Review &amp; Sign Change Order</a>
          </p>
          <p style="font-size:13px;color:#666;">Or open this link:<br><a href="${link}" style="color:#B58A45;">${link}</a></p>
          <p style="font-size:11px;color:#999;margin-top:36px;">Presented with GuildWright</p>
        </div>`;
      const res = await base44.functions.invoke('sendEmail', {
        to: resolvedEmail, subject: `Change order from ${companyName}`, html, from_name: companyName, reply_to: replyTo,
      });
      if (res.data?.error) throw new Error(res.data.error);
      try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }

      setForm(f => ({ ...f, status: 'sent' }));
      queryClient.invalidateQueries({ queryKey: ['client-change-orders'] });
      queryClient.invalidateQueries({ queryKey: ['change-order', id] });
      toast({ title: `Change order emailed to ${resolvedEmail}` });
    } catch (e) {
      toast({ title: e.message || 'Failed to send email', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Link Estimate Dialog, shown when no estimate is linked */}
      <LinkEstimateDialog open={showLinkDialog} onSelect={handleLinkEstimate} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
        <Link to="/estimates">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <Input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Change order title..."
            className="text-lg font-semibold border-0 shadow-none px-0 h-auto focus-visible:ring-0 bg-transparent"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => navigate(`/client-change-order/${id}`)} className="gap-2">
            <Eye className="w-4 h-4" />
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">Save</span>
          </Button>
          <Button onClick={handleSendToClient} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">Send to Client</span>
          </Button>
        </div>
      </div>

      {/* Linked Estimate, read-only */}
      {form.estimate_id ? (
        <div className="bg-muted/40 border border-border rounded-lg px-5 py-4 mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Linked Estimate</span>
            <Badge className="bg-green-100 text-green-800 text-xs">Approved</Badge>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {form.estimate_number && (
              <span><span className="text-muted-foreground">Estimate #</span> <strong>{form.estimate_number}</strong></span>
            )}
            {form.client_name && (
              <span><span className="text-muted-foreground">Client:</span> <strong>{form.client_name}</strong></span>
            )}
            {form.project_name && (
              <span><span className="text-muted-foreground">Project:</span> <strong>{form.project_name}</strong></span>
            )}
            <span>
              <span className="text-muted-foreground">Original Total:</span>{' '}
              <strong>${(form.original_estimate_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              {form.original_estimate_gc_fee && <span className="text-xs text-muted-foreground">(incl. GC fee)</span>}
            </span>
          </div>
          <button
            onClick={() => setShowLinkDialog(true)}
            className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 mb-4 flex items-center justify-between">
          <span className="text-sm text-amber-800">No estimate linked yet.</span>
          <Button size="sm" variant="outline" onClick={() => setShowLinkDialog(true)} className="border-amber-400 text-amber-800 hover:bg-amber-100">
            Link Estimate
          </Button>
        </div>
      )}

      {/* Meta fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">CO Number</label>
          <Input value={form.change_order_number} onChange={e => setForm(f => ({ ...f, change_order_number: e.target.value }))} placeholder="Auto-assigned on save" className="text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Date Issued</label>
          <Input type="date" value={form.date_issued} onChange={e => setForm(f => ({ ...f, date_issued: e.target.value }))} className="text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Valid Through</label>
          <Input type="date" value={form.valid_through} onChange={e => setForm(f => ({ ...f, valid_through: e.target.value }))} className="text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Notes</label>
          <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." className="text-sm" />
        </div>
      </div>

      {/* Main layout: sections + summary */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-4">
          <SectionsEditor
            sections={form.sections}
            onChange={handleSectionsChange}
            categoryMarkups={{ materials: 20, labor: 15, subcontractor: 10, other: 0 }}
          />

          {/* Scope of Work */}
          <Collapsible open={scopeOpen} onOpenChange={setScopeOpen}>
            <div className="bg-card border border-border rounded-lg">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition-colors rounded-lg">
                  <div className="flex items-center gap-2">
                    <List className="w-4 h-4 text-muted-foreground" />
                    Scope of Work
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${scopeOpen ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 border-t border-border pt-3">
                  <Textarea
                    value={form.scope_of_work}
                    onChange={e => setForm(f => ({ ...f, scope_of_work: e.target.value }))}
                    placeholder="Describe the scope of work for this change order..."
                    className="min-h-[120px] text-sm resize-none"
                  />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>

        {/* Summary Panel */}
        <ChangeOrderSummaryPanel
          sections={form.sections}
          gcFeeEnabled={form.gc_fee_enabled}
          gcFeePct={form.gc_fee_pct}
          gcFeeLabel={form.gc_fee_label}
          originalEstimateTotal={form.original_estimate_total}
          onGcChange={(patch) => {
            if ('gc_fee_enabled' in patch) handleGcToggle(patch.gc_fee_enabled);
            else if ('gc_fee_pct' in patch) handleGcPctChange(patch.gc_fee_pct);
            else setForm(f => ({ ...f, ...patch }));
          }}
        />
      </div>
    </div>
  );
}