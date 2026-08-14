import { useState, useEffect, useRef, useMemo } from 'react';
import { base44, supabase } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { deriveInvoicePrefix, formatInvoiceNumber } from '@/lib/invoiceNumber';
import { sortByName } from '@/lib/naturalSort';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, ExternalLink, CheckCircle2, LayoutList, Table2 } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';
import InvoiceSOVPanel from './InvoiceSOVPanel';

const CATEGORIES = ['materials', 'labor', 'subcontractor', 'other'];
const CAT_LABELS = { materials: 'Materials', labor: 'Labor', subcontractor: 'Subcontractor', other: 'Other' };

function fmt(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcLineTotal(item) {
  const base = (item.quantity || 0) * (item.unit_cost || 0);
  return base + base * ((item.markup_pct || 0) / 100);
}

function calcTotals(lineItems) {
  const subtotal = lineItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
  const totalMarkup = lineItems.reduce((s, i) => {
    const base = (i.quantity || 0) * (i.unit_cost || 0);
    return s + base * ((i.markup_pct || 0) / 100);
  }, 0);
  return { subtotal, totalMarkup, grand_total: subtotal + totalMarkup };
}

const PAYMENT_TERMS = [
  { value: 'due_on_receipt', label: 'Due on Receipt', days: 0 },
  { value: 'net_10', label: 'Net 10', days: 10 },
  { value: 'net_15', label: 'Net 15', days: 15 },
  { value: 'net_30', label: 'Net 30', days: 30 },
];

function calcDueDate(issueDate, terms) {
  const term = PAYMENT_TERMS.find(t => t.value === terms);
  if (!term || !issueDate) return '';
  const d = new Date(issueDate);
  d.setDate(d.getDate() + term.days);
  return format(d, 'yyyy-MM-dd');
}

const EMPTY_LINE = () => ({
  id: uuidv4(),
  source: 'manual',
  name: '',
  description: '',
  cost_code: '',
  category: 'other',
  quantity: 1,
  unit_cost: 0,
  markup_pct: 0,
  line_total: 0,
});

export default function InvoiceFormDialog({ open, invoice, onClose, onSaved }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [billingMode, setBillingMode] = useState('line_items'); // 'line_items' | 'schedule_of_values'

  // Form state
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientSearchRef = useRef(null);
  const [projectId, setProjectId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('net_30');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState([EMPTY_LINE()]);
  const [sovEntries, setSovEntries] = useState([]);
  const [coSovEntries, setCoSovEntries] = useState([]);
  const [importedBidIds, setImportedBidIds] = useState([]);

  // Load source data
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list(), enabled: open });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list(), enabled: open });
  const { data: estimates = [] } = useQuery({ queryKey: ['estimates'], queryFn: () => base44.entities.Estimate.list(), enabled: open });
  const { data: bidSubmissions = [] } = useQuery({ queryKey: ['bid-submissions'], queryFn: () => base44.entities.BidSubmission.list(), enabled: open });
  const { data: bidRequests = [] } = useQuery({ queryKey: ['bid-requests'], queryFn: () => base44.entities.BidRequest.list(), enabled: open });
  const { data: changeOrders = [] } = useQuery({ queryKey: ['change-orders'], queryFn: () => base44.entities.ChangeOrder.list(), enabled: open });
  const { data: clientChangeOrders = [] } = useQuery({ queryKey: ['client-change-orders'], queryFn: () => base44.entities.ClientChangeOrder.list(), enabled: open });
  const { data: costCodes = [] } = useQuery({ queryKey: ['cost-codes'], queryFn: () => base44.entities.CostCode.list(), enabled: open });
  const { data: allInvoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: () => base44.entities.Invoice.list(), enabled: open });

  const selectedClient = clients.find(c => c.id === clientId);
  const clientSuggestions = clientSearch.length > 0
    ? clients.filter(c => `${c.name} ${c.contact_name || ''}`.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 6)
    : [];

  const selectClient = (c) => {
    setClientId(c.id);
    setClientSearch(c.name);
    setShowClientDropdown(false);
    setProjectId('');
  };

  // Populate when editing
  useEffect(() => {
    if (open) {
      if (invoice) {
        setClientId(invoice.client_id || '');
        setClientSearch(invoice.client_name || '');
        setProjectId(invoice.project_id || '');
        setInvoiceNumber(invoice.invoice_number || '');
        setIssueDate(invoice.issue_date || format(new Date(), 'yyyy-MM-dd'));
        setDueDate(invoice.due_date || '');
        setPaymentTerms(invoice.payment_terms || 'net_30');
        setNotes(invoice.notes || '');
        setLineItems(invoice.line_items?.length ? invoice.line_items : [EMPTY_LINE()]);
        setSovEntries(invoice.sov_entries || []);
        setCoSovEntries(invoice.co_sov_entries || []);
        setImportedBidIds(invoice.imported_bid_ids || []);
        setBillingMode(invoice.billing_mode || 'line_items');
      } else {
        setClientId(''); setClientSearch(''); setProjectId(''); setInvoiceNumber('');
        setIssueDate(format(new Date(), 'yyyy-MM-dd'));
        setDueDate(''); setNotes('');
        setPaymentTerms('net_30');
        setLineItems([EMPTY_LINE()]);
        setSovEntries([]);
        setCoSovEntries([]);
        setImportedBidIds([]);
        setBillingMode('line_items');
      }
    }
  }, [invoice, open]);

  // Tenant invoice-number format + starting sequence.
  const { data: numSettings } = useQuery({
    queryKey: ['invoice-number-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('invoice_number_format, invoice_seq_start').maybeSingle();
      return data || { invoice_number_format: '{prefix}_{seq:3}', invoice_seq_start: 1 };
    },
  });

  // Auto-generate invoice number for a new invoice from the tenant format + project prefix.
  useEffect(() => {
    if (!invoice && projectId && numSettings) {
      const proj = projects.find(p => p.id === projectId);
      if (proj) {
        const prefix = proj.invoice_prefix || deriveInvoicePrefix(proj.address) || proj.name?.replace(/\s+/g, '') || 'INV';
        const existingCount = allInvoices.filter(i => i.project_id === projectId).length;
        const seq = (numSettings.invoice_seq_start ?? 1) + existingCount;
        setInvoiceNumber(formatInvoiceNumber(numSettings.invoice_number_format, { prefix, seq, projectName: proj.name }));
      }
    }
  }, [projectId, invoice, allInvoices, numSettings]);

  const clientProjects = projects.filter(p =>
    selectedClient ? (p.client_name === selectedClient.name || p.client_id === clientId) : true
  );

  // Bids already imported in OTHER active invoices (not void, not this invoice)
  const billedBidIds = useMemo(() => {
    const otherInvoices = allInvoices.filter(inv =>
      inv.status !== 'void' &&
      inv.id !== invoice?.id
    );
    return new Set(otherInvoices.flatMap(inv => inv.imported_bid_ids || []));
  }, [allInvoices, invoice]);

  const projectEstimates = estimates.filter(e => e.project_id === projectId);
  // Use the most recent approved estimate for GC fee, falling back to any estimate
  const linkedEstimate = projectEstimates.find(e => e.status === 'approved') || projectEstimates[0] || null;
  const projectBids = bidSubmissions.filter(bs => {
    const br = bidRequests.find(r => r.id === bs.bid_request_id);
    return br?.project_id === projectId && bs.status === 'approved';
  });

  // Available bids = not already billed in another invoice AND not already imported in this invoice
  const availableBids = projectBids.filter(bs =>
    !billedBidIds.has(bs.id) && !importedBidIds.includes(bs.id)
  );
  const alreadyImportedBids = projectBids.filter(bs => importedBidIds.includes(bs.id));

  // Line item operations
  const updateLine = (id, field, value) => {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      updated.line_total = calcLineTotal(updated);
      return updated;
    }));
  };

  const removeLine = (id) => setLineItems(prev => prev.filter(i => i.id !== id));
  const addManualLine = () => setLineItems(prev => [...prev, EMPTY_LINE()]);

  const importFromEstimate = (estId) => {
    const est = estimates.find(e => e.id === estId);
    if (!est) return;
    const allItems = (est.sections || []).flatMap(s => s.line_items || []);
    const newLines = allItems.map(li => {
      const base = (li.quantity || 0) * (li.unit_cost || 0);
      const markup = base * ((li.markup_pct || 0) / 100);
      return {
        id: uuidv4(),
        source: 'estimate',
        source_ref_id: li.id,
        name: li.description || '',
        description: '',
        cost_code: li.cost_code || '',
        category: li.category || 'other',
        quantity: li.quantity || 1,
        unit_cost: li.unit_cost || 0,
        markup_pct: li.markup_pct || 0,
        line_total: base + markup,
      };
    });
    // Carry the estimate's GC / PM fee (a % of the line total, not a line item) as a
    // fixed line so the invoice total matches the estimate and the fee is visible.
    if (est.gc_fee_enabled) {
      const lineSum = newLines.reduce((s, l) => s + (l.line_total || 0), 0);
      const gcAmount = lineSum * ((est.gc_fee_pct || 0) / 100);
      if (gcAmount > 0) {
        newLines.push({
          id: uuidv4(),
          source: 'estimate',
          source_ref_id: `gc_fee_${est.id}`,
          name: est.gc_fee_label || 'GC / Project Management Fee',
          description: '',
          cost_code: '',
          category: 'other',
          quantity: 1,
          unit_cost: gcAmount,
          markup_pct: 0,
          line_total: gcAmount,
        });
      }
    }
    setLineItems(prev => [...prev.filter(i => i.name), ...newLines]);
    toast({ title: `Imported ${newLines.length} lines from "${est.title}"` });
  };

  const importFromBid = (bidSubId) => {
    const bs = bidSubmissions.find(b => b.id === bidSubId);
    if (!bs) return;
    const br = bidRequests.find(r => r.id === bs.bid_request_id);
    const line = {
      id: uuidv4(),
      source: 'bid',
      source_ref_id: bs.id,
      name: br?.title || bs.sub_contractor_name,
      description: `Sub-contractor: ${bs.sub_contractor_name}`,
      cost_code: '',
      category: 'subcontractor',
      quantity: 1,
      unit_cost: bs.bid_amount || 0,
      markup_pct: 0,
      line_total: bs.bid_amount || 0,
    };
    const relatedCOs = changeOrders.filter(co => co.bid_request_id === bs.bid_request_id && co.status === 'approved');
    const coLines = relatedCOs.map(co => ({
      id: uuidv4(),
      source: 'bid',
      source_ref_id: co.id,
      name: `Change Order: ${co.description?.slice(0, 40) || 'Additional Work'}`,
      description: co.description || '',
      cost_code: '',
      category: 'subcontractor',
      quantity: 1,
      unit_cost: co.amount || 0,
      markup_pct: 0,
      line_total: co.amount || 0,
    }));
    setLineItems(prev => [...prev.filter(i => i.name), line, ...coLines]);
    setImportedBidIds(prev => [...prev, bidSubId]);
    toast({ title: `Bid imported: ${bs.sub_contractor_name}` });
  };

  const removeImportedBid = (bidSubId) => {
    // Remove bid and its CO lines from line items
    const bs = bidSubmissions.find(b => b.id === bidSubId);
    const relatedCOIds = changeOrders
      .filter(co => co.bid_request_id === bs?.bid_request_id && co.status === 'approved')
      .map(co => co.id);
    const refIdsToRemove = new Set([bidSubId, ...relatedCOIds]);
    setLineItems(prev => prev.filter(i => !refIdsToRemove.has(i.source_ref_id)));
    setImportedBidIds(prev => prev.filter(id => id !== bidSubId));
  };

  const { subtotal, totalMarkup, grand_total } = calcTotals(lineItems);

  // Approved client change orders for this project
  const projectClientCOs = clientChangeOrders.filter(co => co.project_id === projectId && co.status === 'approved');

  // SOV grand total (include CO sov entries)
  const coSovTotal = coSovEntries.reduce((s, e) => s + ((e.current_pct || 0) / 100) * (e.category_total || 0), 0);
  const sovTotal = sovEntries.reduce((s, e) => s + (e.current_amount || 0), 0) + coSovTotal;

  // Build SOV line items for sending (convert groups to simple line items)
  const buildSOVLineItems = () => {
    return sovEntries
      .filter(e => e.current_amount > 0)
      .map(e => {
        const totalBilledPct = e.previous_pct + e.current_pct;
        return {
          id: uuidv4(),
          source: 'manual',
          name: CAT_LABELS[e.category] || 'GC / Project Management Fee',
          description: `${totalBilledPct.toFixed(1)}% billed to date (${e.previous_pct.toFixed(1)}% previously billed, ${e.current_pct.toFixed(1)}% this invoice)`,
          category: e.category,
          quantity: 1,
          unit_cost: e.current_amount,
          markup_pct: 0,
          line_total: e.current_amount,
        };
      });
  };

  const buildPayload = (status) => {
    const isSov = billingMode === 'schedule_of_values';
    const effectiveLineItems = isSov ? buildSOVLineItems() : lineItems.map(i => ({ ...i, line_total: calcLineTotal(i) }));
    const effectiveTotal = isSov ? sovTotal : grand_total;
    return {
      invoice_number: invoiceNumber,
      client_id: clientId,
      client_name: selectedClient?.name || '',
      client_email: selectedClient?.email || '',
      project_id: projectId,
      project_name: projects.find(p => p.id === projectId)?.name || '',
      status,
      billing_mode: billingMode,
      payment_terms: paymentTerms,
      issue_date: issueDate,
      due_date: calcDueDate(issueDate, paymentTerms) || undefined,
      notes,
      line_items: isSov ? lineItems.map(i => ({ ...i, line_total: calcLineTotal(i) })) : effectiveLineItems,
      sov_entries: isSov ? sovEntries : [],
      co_sov_entries: isSov ? coSovEntries : [],
      imported_bid_ids: importedBidIds,
      subtotal: isSov ? sovTotal : subtotal,
      total_markup: isSov ? 0 : totalMarkup,
      grand_total: effectiveTotal,
    };
  };

  const handleSave = async (status = invoice?.status || 'draft') => {
    if (!clientId || !projectId) {
      toast({ title: 'Please select a client and project', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = buildPayload(status);
    if (invoice) {
      await base44.entities.Invoice.update(invoice.id, payload);
    } else {
      await base44.entities.Invoice.create(payload);
    }
    setSaving(false);
    onSaved();
  };

  const handlePushToQBO = async () => {
    if (!clientId || !projectId) {
      toast({ title: 'Please select a client and project', variant: 'destructive' });
      return;
    }
    setPushing(true);
    const payload = buildPayload('sent');
    let savedInvoice;
    if (invoice) {
      savedInvoice = await base44.entities.Invoice.update(invoice.id, payload);
    } else {
      savedInvoice = await base44.entities.Invoice.create(payload);
    }
    const invoiceId = savedInvoice?.id || invoice?.id;
    try {
      await base44.functions.invoke('quickbooksSyncV2', { action: 'push_invoice', invoice_id: invoiceId });
      toast({ title: 'Pushed to QuickBooks!', description: 'Invoice, client, and project synced.' });
    } catch (e) {
      toast({ title: 'Saved, but QBO sync failed', description: e.message, variant: 'destructive' });
    }
    setPushing(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{invoice ? `Invoice ${invoice.invoice_number || ''}` : 'New Invoice'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Client + Project */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Client *</Label>
              <div className="relative" ref={clientSearchRef}>
                <Input
                  value={clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setClientId(''); setShowClientDropdown(true); }}
                  onFocus={() => setShowClientDropdown(true)}
                  onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
                  placeholder="Search clients..."
                  className={clientId ? 'border-primary/50' : ''}
                />
                {showClientDropdown && clientSuggestions.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-md overflow-hidden">
                    {clientSuggestions.map(c => (
                      <button key={c.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex flex-col" onMouseDown={() => selectClient(c)}>
                        <span className="font-medium">{c.name}</span>
                        {c.contact_name && <span className="text-xs text-muted-foreground">{c.contact_name}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Project *</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={!clientId}>
                <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                <SelectContent>
                  {sortByName(clientProjects).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Invoice number + dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Invoice Number</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="PROJ-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Issue Date</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={v => { setPaymentTerms(v); setDueDate(calcDueDate(issueDate, v)); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Import section */}
          {projectId && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Import Line Items</Label>

              {/* Estimates */}
              {projectEstimates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {projectEstimates.map(est => (
                    <Button key={est.id} size="sm" variant="outline" onClick={() => importFromEstimate(est.id)} className="gap-1.5">
                      <Plus className="w-3 h-3" />From Estimate: {est.title}
                    </Button>
                  ))}
                </div>
              )}

              {/* Available bids to import */}
              {availableBids.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {availableBids.map(bs => (
                    <Button key={bs.id} size="sm" variant="outline" onClick={() => importFromBid(bs.id)} className="gap-1.5">
                      <Plus className="w-3 h-3" />From Bid: {bs.sub_contractor_name}
                    </Button>
                  ))}
                </div>
              )}

              {/* Already-imported bids (with remove option) */}
              {alreadyImportedBids.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {alreadyImportedBids.map(bs => (
                    <div key={bs.id} className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="w-3 h-3" />
                      {bs.sub_contractor_name} (imported)
                      <button onClick={() => removeImportedBid(bs.id)} className="ml-1 hover:text-red-600 transition-colors">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Bids billed in other invoices */}
              {projectBids.filter(bs => billedBidIds.has(bs.id)).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {projectBids.filter(bs => billedBidIds.has(bs.id)).map(bs => (
                    <div key={bs.id} className="flex items-center gap-1 bg-muted border border-border rounded-md px-2 py-1 text-xs text-muted-foreground">
                      {bs.sub_contractor_name}, already billed
                    </div>
                  ))}
                </div>
              )}

              {projectEstimates.length === 0 && projectBids.length === 0 && (
                <p className="text-sm text-muted-foreground">No estimates or approved bids found for this project.</p>
              )}
            </div>
          )}

          {/* Billing mode toggle */}
          {projectId && (
            <div className="space-y-2">
              <Label>Billing Mode</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={billingMode === 'line_items' ? 'default' : 'outline'}
                  onClick={() => setBillingMode('line_items')}
                  className="gap-1.5"
                >
                  <LayoutList className="w-3.5 h-3.5" />Itemized
                </Button>
                <Button
                  size="sm"
                  variant={billingMode === 'schedule_of_values' ? 'default' : 'outline'}
                  onClick={() => setBillingMode('schedule_of_values')}
                  className="gap-1.5"
                >
                  <Table2 className="w-3.5 h-3.5" />Schedule of Values
                </Button>
              </div>
            </div>
          )}

          {/* Schedule of Values Panel */}
          {billingMode === 'schedule_of_values' ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Schedule of Values</Label>
              <InvoiceSOVPanel
                lineItems={lineItems}
                sovEntries={sovEntries}
                onChange={setSovEntries}
                coSovEntries={coSovEntries}
                onCoSovChange={setCoSovEntries}
                projectId={projectId}
                allInvoices={allInvoices.filter(i => i.id !== invoice?.id)}
                estimate={linkedEstimate}
                gcSovEntry={sovEntries.find(e => e.category === 'gc_fee')}
                onGcChange={entry => {
                  setSovEntries(prev => {
                    const filtered = prev.filter(e => e.category !== 'gc_fee');
                    return [...filtered, { ...entry, category: 'gc_fee' }];
                  });
                }}
                clientChangeOrders={projectClientCOs}
              />
            </div>
          ) : (
            <>
              {/* Line Items */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Line Items</Label>

                <div className="space-y-3">
                  {lineItems.map((item, idx) => (
                    <div key={item.id} className="border border-border rounded-lg p-3 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-muted-foreground font-medium mt-1">#{idx + 1}</span>
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="space-y-1 sm:col-span-1">
                            <Label className="text-xs">Name *</Label>
                            <Input value={item.name} onChange={e => updateLine(item.id, 'name', e.target.value)} placeholder="Item name" className="h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Category</Label>
                            <Select value={item.category || 'other'} onValueChange={v => updateLine(item.id, 'category', v)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CAT_LABELS[c]}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Cost Code</Label>
                            <Select value={item.cost_code || ''} onValueChange={v => updateLine(item.id, 'cost_code', v)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={null}>None</SelectItem>
                                {costCodes.filter(c => c.is_active).map(cc => (
                                  <SelectItem key={cc.id} value={cc.code}>{cc.code}, {cc.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => removeLine(item.id)} className="h-7 w-7 p-0 text-red-500 shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Description</Label>
                        <Input value={item.description} onChange={e => updateLine(item.id, 'description', e.target.value)} placeholder="Optional details..." className="h-8 text-sm" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Qty</Label>
                          <Input type="number" min="0" step="any" value={item.quantity} onChange={e => updateLine(item.id, 'quantity', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unit Cost ($)</Label>
                          <Input type="number" min="0" step="0.01" value={item.unit_cost} onChange={e => updateLine(item.id, 'unit_cost', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Markup %</Label>
                          <Input type="number" min="0" step="0.1" value={item.markup_pct} onChange={e => updateLine(item.id, 'markup_pct', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                        </div>
                      </div>
                      <div className="text-right text-sm font-semibold text-foreground">
                        Line Total: {fmt(calcLineTotal(item))}
                      </div>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={addManualLine} className="w-full">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
                  </Button>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Markup</span><span>{fmt(totalMarkup)}</span></div>
                <div className="flex justify-between font-bold text-base text-foreground border-t border-border pt-2 mt-1">
                  <span>Total</span><span>{fmt(grand_total)}</span>
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment terms, additional details..." rows={2} />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => handleSave()} disabled={saving}>
            {saving ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button onClick={handlePushToQBO} disabled={pushing} className="gap-2">
            <ExternalLink className="w-4 h-4" />
            {pushing ? 'Pushing...' : 'Push to QuickBooks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}