import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Loader2, Eye, Send, AlertTriangle, FileDown, List, LayoutTemplate } from 'lucide-react';
import ImportTemplateDialog from '@/components/estimation/ImportTemplateDialog';
import CreateProjectFromEstimateDialog from '@/components/estimation/CreateProjectFromEstimateDialog';
import ClientSearchPicker from '@/components/shared/ClientSearchPicker';
import { useToast } from '@/components/ui/use-toast';
import CategoryMarkupsPanel from '@/components/estimation/CategoryMarkupsPanel';
import SectionsEditor from '@/components/estimation/SectionsEditor';
import EstimateSummaryPanel from '@/components/estimation/EstimateSummaryPanel';
import LegacyEstimate from '@/components/estimation/LegacyEstimate';
import ScopeOfWorkEditor from '@/components/estimation/ScopeOfWorkEditor';
import EstimateOutputSettings from '@/components/estimation/EstimateOutputSettings';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

const DEFAULT_MARKUPS = { materials: 20, labor: 15, subcontractor: 10, other: 0 };

function calcTotals(sections, gcFeeEnabled, gcFeePct) {
  const allItems = (sections || []).flatMap(s => s.line_items || []);
  const subtotal = allItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
  const lineTotal = allItems.reduce((s, i) => s + (i.line_total || 0), 0);
  const totalMarkup = lineTotal - subtotal;
  const gcFeeAmount = gcFeeEnabled ? lineTotal * ((gcFeePct || 0) / 100) : 0;
  const grandTotal = lineTotal + gcFeeAmount;
  return { subtotal, total_markup: totalMarkup, grand_total: grandTotal };
}

export default function EstimateBuilder() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [scopeOpen, setScopeOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(true);
  const [importTemplateOpen, setImportTemplateOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const [form, setForm] = useState({
    title: '',
    status: 'draft',
    client_id: '',
    client_name: '',
    project_id: '',
    project_name: '',
    notes: '',
    client_intro: '',
    category_markups: { ...DEFAULT_MARKUPS },
    sections: [],
    scope_of_work: [],
    gc_fee_enabled: true,
    gc_fee_pct: 13,
    gc_fee_label: 'GC / Project Management Fee',
    column_settings: { show_qty: true, show_unit: true, show_line_total: true },
    estimate_number: '',
    subtotal: 0,
    total_markup: 0,
    grand_total: 0,
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ['estimate', id],
    queryFn: () => base44.entities.Estimate.get(id),
    enabled: !isNew,
    // Don't let a background refetch (e.g. window refocus) clobber in-progress edits.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // Hydrate the form from the server record only ONCE per estimate id. Without this
  // guard, any later refetch of `existing` overwrites the user's unsaved edits.
  const hydratedRef = useRef(null);

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('name', 100),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('name', 100),
  });

  const { data: allEstimates = [] } = useQuery({
    queryKey: ['estimates-count'],
    queryFn: () => base44.entities.Estimate.list('-created_date', 1000),
    enabled: isNew,
  });


  useEffect(() => {
    if (existing && hydratedRef.current !== existing.id) {
      hydratedRef.current = existing.id;
      // Migrate legacy flat line_items to a single section
      let sections = existing.sections || [];
      if (sections.length === 0 && (existing.line_items || []).length > 0) {
        sections = [{ id: 'migrated', name: 'Line Items', line_items: existing.line_items }];
      }
      setForm({
        title: existing.title || '',
        status: existing.status || 'draft',
        client_id: existing.client_id || '',
        client_name: existing.client_name || '',
        project_id: existing.project_id || '',
        project_name: existing.project_name || '',
        notes: existing.notes || '',
        client_intro: existing.client_intro || '',
        category_markups: existing.category_markups || { ...DEFAULT_MARKUPS },
        sections,
        scope_of_work: existing.scope_of_work || [],
        gc_fee_enabled: existing.gc_fee_enabled ?? false,
        gc_fee_pct: existing.gc_fee_pct ?? 10,
        gc_fee_label: existing.gc_fee_label || 'GC / Project Management Fee',
        column_settings: existing.column_settings || { show_qty: true, show_unit: true, show_line_total: true },
        estimate_number: existing.estimate_number || '',
        subtotal: existing.subtotal || 0,
        total_markup: existing.total_markup || 0,
        grand_total: existing.grand_total || 0,
      });
    }
  }, [existing]);

  const selectedClient = clients.find(c => c.id === form.client_id) || null;
  const clientEmail = selectedClient?.email || '';
  const clientHasNoEmail = form.client_id && !clientEmail;

  const handleProjectChange = (projectId) => {
    if (projectId === '__none__') { setForm(f => ({ ...f, project_id: '', project_name: '' })); return; }
    const project = projects.find(p => p.id === projectId);
    setForm(f => ({ ...f, project_id: projectId, project_name: project?.name || '' }));
  };

  // Auto-recalculate labor items when material quantities change
  const handleSectionsChange = (sections) => {
    const updatedSections = sections.map(section => {
      const materialItems = (section.line_items || []).filter(i => i.category === 'materials');
      const updatedItems = (section.line_items || []).map(item => {
        if (item.category !== 'labor' || item.labor_auto === false) return item;
        // Auto-labor: recalc from material items that have labor_cost_per_unit
        const autoTotal = materialItems
          .filter(m => (m.labor_cost_per_unit || 0) > 0)
          .reduce((sum, m) => sum + (m.quantity || 0) * m.labor_cost_per_unit, 0);
        // Auto labor always reflects the live material labor total (including $0 when
        // no material carries a per-unit labor cost). Manual lines are skipped above.
        const markupPct = item.markup_pct || 0;
        const newLineTotal = autoTotal + autoTotal * (markupPct / 100);
        return { ...item, unit_cost: autoTotal, line_total: newLineTotal };
      });
      return { ...section, line_items: updatedItems };
    });
    setForm(f => {
      const totals = calcTotals(updatedSections, f.gc_fee_enabled, f.gc_fee_pct);
      return { ...f, sections: updatedSections, ...totals };
    });
  };

  const handleGcChange = (patch) => {
    setForm(f => {
      const next = { ...f, ...patch };
      const totals = calcTotals(next.sections, next.gc_fee_enabled, next.gc_fee_pct);
      return { ...next, ...totals };
    });
  };

  const handleShareAsPdf = () => {
    setPreviewing(true);
    // After preview opens, user can use the Print/Save PDF button
  };

  // Next estimate number from the max existing EST-#### (survives deletions).
  const genEstimateNumber = () => {
    const nums = (allEstimates || []).map(e => {
      const m = /EST-(\d+)/i.exec(e.estimate_number || '');
      return m ? parseInt(m[1], 10) : 0;
    });
    const next = (nums.length ? Math.max(0, ...nums) : 0) + 1;
    return `EST-${String(next).padStart(4, '0')}`;
  };

  // Save (create or update) with fresh totals; returns the estimate id.
  const persist = async () => {
    const freshTotals = calcTotals(form.sections, form.gc_fee_enabled, form.gc_fee_pct);
    if (isNew) {
      const estimate_number = form.estimate_number || genEstimateNumber();
      const created = await base44.entities.Estimate.create({ ...form, ...freshTotals, estimate_number });
      hydratedRef.current = created.id; // don't let the post-navigate refetch re-hydrate
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      navigate(`/estimates/${created.id}`, { replace: true });
      return created.id;
    }
    await base44.entities.Estimate.update(id, { ...form, ...freshTotals });
    queryClient.invalidateQueries({ queryKey: ['estimates'] });
    return id;
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await persist();
      toast({ title: isNew ? 'Estimate created' : 'Estimate saved' });
    } catch (e) {
      toast({ title: 'Could not save estimate', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const estimateEmailHtml = ({ companyName, clientName, title, total, link }) => {
    const money = total != null ? `$${Number(total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
    return `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#262525;max-width:520px;margin:0 auto;line-height:1.6;">
        <p>Hi ${clientName || 'there'},</p>
        <p>Your estimate${title ? ` for <strong>${title}</strong>` : ''} from ${companyName} is ready to review${money ? `, totaling <strong>${money}</strong>` : ''}.</p>
        <p style="margin:28px 0;">
          <a href="${link}" style="background:#262525;color:#ffffff;padding:13px 26px;text-decoration:none;border-radius:4px;letter-spacing:0.04em;display:inline-block;">Review &amp; Sign Your Estimate</a>
        </p>
        <p style="font-size:13px;color:#666;">Or open this link:<br><a href="${link}" style="color:#B58A45;">${link}</a></p>
        <p style="font-size:11px;color:#999;margin-top:36px;">Presented with GuildWright</p>
      </div>`;
  };

  const handleSendToClient = async () => {
    if (!form.title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    if (!form.client_id) { toast({ title: 'Select a client first', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const estimateId = await persist();
      const link = `${window.location.origin}/client-estimate?id=${estimateId}`;
      const total = calcTotals(form.sections, form.gc_fee_enabled, form.gc_fee_pct).grand_total;
      setForm(f => ({ ...f, status: 'sent' }));

      let email = clientEmail;
      if (!email) {
        try { const c = await base44.entities.Client.get(form.client_id); email = c?.email || ''; } catch { /* ignore */ }
      }

      if (email) {
        let companyName = 'Your contractor';
        let replyTo;
        try {
          const companies = await base44.entities.Company.list();
          companyName = companies?.[0]?.name || companyName;
          const meUser = await base44.auth.me();
          replyTo = meUser?.email;
        } catch { /* ignore */ }
        const html = estimateEmailHtml({ companyName, clientName: form.client_name, title: form.title, total, link });
        const res = await base44.functions.invoke('sendEmail', {
          to: email, subject: `Your estimate from ${companyName}`, html, from_name: companyName, reply_to: replyTo,
        });
        try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
        if (res.data?.error) {
          toast({ title: 'Could not email the client', description: `${res.data.error}. The link was copied instead.`, variant: 'destructive' });
        } else {
          toast({ title: `Estimate emailed to ${email}`, description: 'The signing link was also copied to your clipboard.' });
        }
      } else {
        let copied = false;
        try { await navigator.clipboard.writeText(link); copied = true; } catch { /* ignore */ }
        if (copied) toast({ title: 'No email on file, link copied', description: 'Paste it into a text to your client, or add their email in the Client directory.' });
        else window.prompt('Copy this client signing link:', link);
      }
    } catch (e) {
      toast({ title: 'Could not send to client', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleTemplateImport = ({ sections, category_markups }) => {
    setForm(f => {
      const totals = calcTotals(sections, f.gc_fee_enabled, f.gc_fee_pct);
      return { ...f, sections, category_markups: { ...f.category_markups, ...category_markups }, ...totals };
    });
    toast({ title: 'Template imported' });
  };

  if (!isNew && isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (previewing) {
    return <LegacyEstimate estimate={{ ...form, id: isNew ? undefined : id }} onClose={() => setPreviewing(false)} />;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
        <Link to="/estimates">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Estimate title..."
            className="text-lg font-semibold border-0 shadow-none px-0 h-auto focus-visible:ring-0 bg-transparent"
          />
          {isNew && (
            <Button variant="outline" size="sm" onClick={() => setImportTemplateOpen(true)} className="shrink-0 gap-1.5">
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import Template</span>
            </Button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
        <Select
          value={form.status}
          onValueChange={v => {
            setForm(f => ({ ...f, status: v }));
            if (v === 'approved' && !form.project_id && !isNew) {
              setCreateProjectOpen(true);
            }
          }}
        >
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setPreviewing(true)} className="gap-2">
          <Eye className="w-4 h-4" />
          <span className="hidden sm:inline">Preview</span>
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span className="hidden sm:inline">Save</span>
        </Button>
        <Button onClick={handleSendToClient} disabled={sending} variant="default" className="gap-2 bg-primary">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span className="hidden sm:inline">Send to Client</span>
        </Button>
        </div>
      </div>

      {clientHasNoEmail && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
          <div className="flex items-center gap-2 text-amber-800 flex-1">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>{selectedClient?.name}</strong> has no email address on file, the estimate cannot be sent electronically.
              Add an email in the <a href="/clients" className="underline font-medium">Client Directory</a> to enable sending, or share as a PDF below.
            </span>
          </div>
          <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0 gap-1.5" onClick={handleShareAsPdf}>
            <FileDown className="w-4 h-4" />
            Share as PDF
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Client <span className="text-destructive">*</span></label>
          <ClientSearchPicker
            mode="id"
            value={form.client_id}
            onChange={(id) => {
              const client = clients.find(c => c.id === id);
              setForm(f => ({ ...f, client_id: id, client_name: client?.name || '' }));
            }}
            placeholder="Search clients..."
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Project (optional)</label>
          <Select value={form.project_id || '__none__'} onValueChange={handleProjectChange}>
            <SelectTrigger><SelectValue placeholder="Standalone" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Standalone</SelectItem>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {form.project_id && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Linked Project</label>
            <p className="text-sm text-foreground font-medium px-3 py-2 bg-muted/40 rounded-md border border-border">{form.project_name || form.project_id}</p>
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Internal notes <span className="text-muted-foreground/60">(never shown to client)</span>
          </label>
          <Textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Private notes for your team..."
            className="h-9 resize-none text-sm"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="text-xs text-muted-foreground block mb-1">
            Client intro <span className="text-muted-foreground/60">(shown at the top of the client's estimate)</span>
          </label>
          <Textarea
            value={form.client_intro}
            onChange={e => setForm(f => ({ ...f, client_intro: e.target.value }))}
            placeholder="A short intro paragraph your client will see on the estimate..."
            className="h-16 resize-none text-sm"
          />
        </div>
      </div>

      <div className="mb-4">
        <CategoryMarkupsPanel
          markups={form.category_markups}
          onChange={markups => setForm(f => ({ ...f, category_markups: markups }))}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-4">
          <SectionsEditor
            sections={form.sections}
            onChange={handleSectionsChange}
            categoryMarkups={form.category_markups}
          />

          {/* Scope of Work */}
          <Collapsible open={scopeOpen} onOpenChange={setScopeOpen}>
            <div className="bg-card border border-border rounded-lg">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition-colors rounded-lg">
                  <div className="flex items-center gap-2">
                    <List className="w-4 h-4 text-muted-foreground" />
                    Scope of Work
                    {(form.scope_of_work || []).length > 0 && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-normal">
                        {form.scope_of_work.length} items
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${scopeOpen ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 border-t border-border pt-3">
                  <ScopeOfWorkEditor
                    items={form.scope_of_work || []}
                    onChange={items => setForm(f => ({ ...f, scope_of_work: items }))}
                  />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>

        <div className="space-y-4">
          <Collapsible open={outputOpen} onOpenChange={setOutputOpen}>
            <div className="bg-card border border-border rounded-lg">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition-colors rounded-lg">
                  Output Settings
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${outputOpen ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 border-t border-border pt-3">
                  <EstimateOutputSettings
                    form={form}
                    onChange={patch => {
                      const gcKeys = ['gc_fee_enabled', 'gc_fee_pct', 'gc_fee_label'];
                      const hasGcChange = gcKeys.some(k => k in patch);
                      if (hasGcChange) {
                        handleGcChange(patch);
                      } else {
                        setForm(f => ({ ...f, ...patch }));
                      }
                    }}
                  />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
          <EstimateSummaryPanel
            sections={form.sections}
            gcFeeEnabled={form.gc_fee_enabled}
            gcFeePct={form.gc_fee_pct}
            gcFeeLabel={form.gc_fee_label}
          />
        </div>
      </div>
      <ImportTemplateDialog
        open={importTemplateOpen}
        onOpenChange={setImportTemplateOpen}
        onImport={handleTemplateImport}
      />

      <CreateProjectFromEstimateDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        estimate={form}
        onCreated={async (project) => {
          setCreateProjectOpen(false);
          setForm(f => ({ ...f, project_id: project.id, project_name: project.name }));
          await base44.entities.Estimate.update(id, { ...form, project_id: project.id, project_name: project.name, status: 'approved' });
          queryClient.invalidateQueries({ queryKey: ['projects'] });
          queryClient.invalidateQueries({ queryKey: ['estimates'] });
          queryClient.invalidateQueries({ queryKey: ['estimate', id] });
          toast({ title: `Project "${project.name}" created and linked!` });
        }}
        onSkip={() => setCreateProjectOpen(false)}
      />

    </div>
  );
}