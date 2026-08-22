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
import { Plus, Trash2, ExternalLink, CheckCircle2, LayoutList, Table2, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';
import InvoiceSOVPanel from './InvoiceSOVPanel';

const CATEGORIES = ['materials', 'labor', 'subcontractor', 'other'];
const CAT_LABELS = { materials: 'Materials', labor: 'Labor', subcontractor: 'Subcontractor', other: 'Other' };

function fmt(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function calcLineTotal(item) {
  const base = (item.quantity || 0) * (item.unit_cost || 0);
  return base + base * ((item.markup_pct || 0) / 100);
}

// QuickBooks rounds each line to the penny and sums those, so the invoice total is the sum of the
// ROUNDED line amounts, not the raw sum. Totaling raw values left GW a cent off from QBO (e.g.
// 4346.98 vs 4346.99) — confusing on screen and able to leave a residual balance on the QBO side.
function calcTotals(lineItems) {
  let subtotal = 0, grand = 0;
  for (const i of lineItems) {
    subtotal += round2((i.quantity || 0) * (i.unit_cost || 0));
    grand += round2(calcLineTotal(i));
  }
  subtotal = round2(subtotal);
  grand = round2(grand);
  return { subtotal, totalMarkup: round2(grand - subtotal), grand_total: grand };
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
  const [importedExpenseIds, setImportedExpenseIds] = useState([]);

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
  const { data: allExpenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: () => base44.entities.Expense.list('-date'), enabled: open });

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
        setImportedExpenseIds(invoice.imported_expense_ids || []);
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
        setImportedExpenseIds([]);
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

  // Billable expenses for this project. Available = billable, not staged here, and not already
  // billed by a different invoice (billed expenses carry the invoice_id of whoever consumed them).
  const projectExpenses = allExpenses.filter(e => e.project_id === projectId && e.billable);
  const availableExpenses = projectExpenses.filter(e =>
    !importedExpenseIds.includes(e.id) && (!e.billed || e.invoice_id === invoice?.id)
  );
  const alreadyImportedExpenses = projectExpenses.filter(e => importedExpenseIds.includes(e.id));
  const expenseLabel = (e) => `${e.vendor || e.description || 'Expense'}${e.total_amount ? ` (${fmt(e.total_amount)})` : ''}`;

  // Progress-billing context: what this project has ALREADY been invoiced (prior non-void invoices,
  // not this one), overall and by category — so an itemized invoice following an SOV deposit doesn't
  // silently double-bill. SOV invoices contribute each category's current_amount; itemized invoices
  // contribute each line's total.
  const priorInvoices = allInvoices.filter(i => i.project_id === projectId && i.status !== 'void' && i.id !== invoice?.id);
  const billedToDate = priorInvoices.reduce((s, i) => s + (Number(i.grand_total) || 0), 0);
  const billedByCategory = {};
  for (const inv of priorInvoices) {
    if (inv.billing_mode === 'schedule_of_values') {
      for (const e of (inv.sov_entries || [])) {
        const cat = e.category === 'gc_fee' ? 'other' : (e.category || 'other');
        billedByCategory[cat] = (billedByCategory[cat] || 0) + (Number(e.current_amount) || 0);
      }
      for (const e of (inv.co_sov_entries || [])) {
        const cat = e.category === 'gc_fee' ? 'other' : (e.category || 'other');
        billedByCategory[cat] = (billedByCategory[cat] || 0) + ((Number(e.current_pct) || 0) / 100) * (Number(e.category_total) || 0);
      }
    } else {
      for (const li of (inv.line_items || [])) {
        const cat = li.category === 'gc_fee' ? 'other' : (li.category || 'other');
        billedByCategory[cat] = (billedByCategory[cat] || 0) + (Number(li.line_total) || 0);
      }
    }
  }
  // Contract totals per category from the linked estimate, for the % context.
  const contractByCategory = {};
  for (const s of (linkedEstimate?.sections || [])) {
    for (const li of (s.line_items || [])) {
      const cat = li.category || 'other';
      contractByCategory[cat] = (contractByCategory[cat] || 0) + (Number(li.line_total) || 0);
    }
  }
  if (linkedEstimate?.gc_fee_enabled) {
    const lineSum = Object.values(contractByCategory).reduce((a, b) => a + b, 0);
    contractByCategory.other = (contractByCategory.other || 0) + lineSum * ((linkedEstimate.gc_fee_pct || 0) / 100);
  }
  const contractTotal = Number(linkedEstimate?.grand_total) || Object.values(contractByCategory).reduce((a, b) => a + b, 0);

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

  const importFromExpense = (expenseId) => {
    const exp = allExpenses.find(e => e.id === expenseId);
    if (!exp) return;
    const amount = exp.total_amount || 0;
    const line = {
      id: uuidv4(),
      source: 'expense',
      source_ref_id: exp.id,
      name: exp.vendor || exp.description || 'Expense',
      description: exp.description || (exp.date ? `Expense ${exp.date}` : ''),
      cost_code: exp.cost_code || '',
      category: exp.expense_category || 'materials',
      quantity: 1,
      unit_cost: amount,
      markup_pct: 0,
      line_total: amount,
    };
    setLineItems(prev => [...prev.filter(i => i.name), line]);
    setImportedExpenseIds(prev => [...prev, expenseId]);
    toast({ title: `Expense imported: ${exp.vendor || 'expense'}` });
  };

  const removeImportedExpense = (expenseId) => {
    setLineItems(prev => prev.filter(i => !(i.source === 'expense' && i.source_ref_id === expenseId)));
    setImportedExpenseIds(prev => prev.filter(id => id !== expenseId));
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

  // Line-level progress billing: once a project has prior billing, each itemized line shows its
  // category's already-billed % and you bill an additional % or $ per line as work completes. Off
  // for a project's first invoice (no priors), so a normal itemized invoice bills full lines.
  const progressMode = billingMode === 'line_items' && priorInvoices.length > 0;
  const categoryPriorPct = (cat) => {
    const c = cat === 'gc_fee' ? 'other' : (cat || 'other');
    const contract = contractByCategory[c] || 0;
    return contract > 0 ? Math.min(100, ((billedByCategory[c] || 0) / contract) * 100) : 0;
  };
  const progressTotal = round2(lineItems.reduce((s, i) => s + (Number(i.bill_amount) || 0), 0));
  // Entering a % sets the $ (of the line's full contract value), and vice-versa; bill_amount is canonical.
  const setBillPct = (id, pct) => setLineItems(prev => prev.map(it => {
    if (it.id !== id) return it;
    const p = Math.max(0, Math.min(100, parseFloat(pct) || 0));
    return { ...it, bill_pct: p, bill_amount: round2((p / 100) * calcLineTotal(it)) };
  }));
  const setBillAmount = (id, amt) => setLineItems(prev => prev.map(it => {
    if (it.id !== id) return it;
    const contract = calcLineTotal(it);
    const a = round2(Math.max(0, parseFloat(amt) || 0));
    return { ...it, bill_amount: a, bill_pct: contract > 0 ? Math.round((a / contract) * 1000) / 10 : 0 };
  }));

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
    // Progress lines store line_total = the amount billed THIS invoice, plus contract_amount/bill_pct/
    // prior_pct for context; only lines with a billed amount are sent. Non-progress bills full lines.
    const itemizedLines = progressMode
      ? lineItems
          .map(i => ({
            ...i,
            contract_amount: round2(calcLineTotal(i)),
            bill_pct: round2(Number(i.bill_pct) || 0),
            prior_pct: round2(categoryPriorPct(i.category)),
            line_total: round2(Number(i.bill_amount) || 0),
          }))
          .filter(i => (i.line_total || 0) > 0)
      : lineItems.map(i => ({ ...i, line_total: round2(calcLineTotal(i)) }));
    const effectiveLineItems = isSov ? buildSOVLineItems() : itemizedLines;
    const effectiveTotal = isSov ? sovTotal : (progressMode ? progressTotal : grand_total);
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
      line_items: isSov ? lineItems.map(i => ({ ...i, line_total: round2(calcLineTotal(i)) })) : effectiveLineItems,
      sov_entries: isSov ? sovEntries : [],
      co_sov_entries: isSov ? coSovEntries : [],
      imported_bid_ids: importedBidIds,
      imported_expense_ids: importedExpenseIds,
      subtotal: isSov ? sovTotal : (progressMode ? progressTotal : subtotal),
      total_markup: isSov ? 0 : (progressMode ? 0 : totalMarkup),
      grand_total: effectiveTotal,
    };
  };

  // Mark the expenses this invoice bills as billed (with a back-pointer), and release any that were
  // removed since it was last saved, so an expense can't be double-billed and frees up if dropped.
  const syncExpenseBilling = async (invoiceId) => {
    if (!invoiceId) return;
    const prevIds = invoice?.imported_expense_ids || [];
    const removed = prevIds.filter(id => !importedExpenseIds.includes(id));
    await Promise.all([
      ...importedExpenseIds.map(id => base44.entities.Expense.update(id, { billed: true, invoice_id: invoiceId })),
      ...removed.map(id => base44.entities.Expense.update(id, { billed: false, invoice_id: null })),
    ]);
  };

  const handleSave = async (status = invoice?.status || 'draft') => {
    if (!clientId || !projectId) {
      toast({ title: 'Please select a client and project', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = buildPayload(status);
    let saved;
    if (invoice) {
      saved = await base44.entities.Invoice.update(invoice.id, payload);
    } else {
      saved = await base44.entities.Invoice.create(payload);
    }
    await syncExpenseBilling(saved?.id || invoice?.id);
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
    await syncExpenseBilling(invoiceId);
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

          {/* Billed to date — awareness so an itemized invoice after an SOV deposit doesn't double-bill */}
          {projectId && priorInvoices.length > 0 && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4" /> Billed to date on this project
                </span>
                <span className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  {fmt(billedToDate)}{contractTotal > 0 ? ` of ${fmt(contractTotal)} (${Math.round((billedToDate / contractTotal) * 100)}%)` : ''}
                </span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                {priorInvoices.length} prior invoice{priorInvoices.length > 1 ? 's' : ''}. This invoice adds to the total{contractTotal > 0 ? ' — avoid billing past the contract' : ''}.
              </p>
              {Object.keys(billedByCategory).length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['materials', 'labor', 'subcontractor', 'other'].filter(c => (billedByCategory[c] || 0) > 0 || (contractByCategory[c] || 0) > 0).map(cat => {
                    const billed = billedByCategory[cat] || 0;
                    const contract = contractByCategory[cat] || 0;
                    const pct = contract > 0 ? Math.round((billed / contract) * 100) : null;
                    return (
                      <div key={cat} className="bg-white/60 dark:bg-black/20 rounded px-2 py-1.5">
                        <div className="text-[11px] text-amber-700 dark:text-amber-400">{CAT_LABELS[cat] || cat}</div>
                        <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 whitespace-nowrap">
                          {fmt(billed)}{pct !== null ? ` · ${pct}%` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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

              {/* Available billable expenses to import */}
              {availableExpenses.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {availableExpenses.map(e => (
                    <Button key={e.id} size="sm" variant="outline" onClick={() => importFromExpense(e.id)} className="gap-1.5">
                      <Plus className="w-3 h-3" />From Expense: {expenseLabel(e)}
                    </Button>
                  ))}
                </div>
              )}

              {/* Already-imported expenses (with remove option) */}
              {alreadyImportedExpenses.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {alreadyImportedExpenses.map(e => (
                    <div key={e.id} className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="w-3 h-3" />
                      {expenseLabel(e)} (imported)
                      <button onClick={() => removeImportedExpense(e.id)} className="ml-1 hover:text-red-600 transition-colors">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Expenses billed on another invoice */}
              {projectExpenses.filter(e => e.billed && e.invoice_id && e.invoice_id !== invoice?.id).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {projectExpenses.filter(e => e.billed && e.invoice_id && e.invoice_id !== invoice?.id).map(e => (
                    <div key={e.id} className="flex items-center gap-1 bg-muted border border-border rounded-md px-2 py-1 text-xs text-muted-foreground">
                      {expenseLabel(e)}, already billed
                    </div>
                  ))}
                </div>
              )}

              {projectEstimates.length === 0 && projectBids.length === 0 && projectExpenses.length === 0 && (
                <p className="text-sm text-muted-foreground">No estimates, approved bids, or billable expenses found for this project.</p>
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
                      {progressMode ? (() => {
                        const contract = calcLineTotal(item);
                        const prior = Math.round(categoryPriorPct(item.category));
                        const toDate = Math.round(prior + (Number(item.bill_pct) || 0));
                        return (
                          <div className="rounded-md bg-muted/40 border border-border p-2.5 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Contract: <span className="font-semibold text-foreground">{fmt(contract)}</span></span>
                              <span className="text-muted-foreground">{prior}% billed · {CAT_LABELS[item.category] || item.category}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Bill this invoice (%)</Label>
                                <Input type="number" min="0" max="100" step="any" value={item.bill_pct ?? 0}
                                  onChange={e => setBillPct(item.id, e.target.value)} className="h-8 text-sm" placeholder="0" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Bill this invoice ($)</Label>
                                <Input type="number" min="0" step="0.01" value={item.bill_amount ?? 0}
                                  onChange={e => setBillAmount(item.id, e.target.value)} className="h-8 text-sm" placeholder="0.00" />
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className={toDate > 100 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                                To date: {toDate}%{toDate > 100 ? ' (over contract)' : ''}
                              </span>
                              <span className="font-semibold text-foreground">Billing: {fmt(item.bill_amount || 0)}</span>
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="text-right text-sm font-semibold text-foreground">
                          Line Total: {fmt(calcLineTotal(item))}
                        </div>
                      )}
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={addManualLine} className="w-full">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
                  </Button>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-1.5 text-sm">
                {progressMode ? (
                  <div className="flex justify-between font-bold text-base text-foreground">
                    <span>Billing this invoice</span><span>{fmt(progressTotal)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Markup</span><span>{fmt(totalMarkup)}</span></div>
                    <div className="flex justify-between font-bold text-base text-foreground border-t border-border pt-2 mt-1">
                      <span>Total</span><span>{fmt(grand_total)}</span>
                    </div>
                  </>
                )}
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