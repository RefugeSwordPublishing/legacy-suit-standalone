import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Eye, Trash2, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import InvoiceFormDialog from '@/components/estimation/InvoiceFormDialog';
import InvoicePrintView from '@/components/estimation/InvoicePrintView';
import { useToast } from '@/components/ui/use-toast';
import ListToolbar from '@/components/shared/ListToolbar';
import { naturalCompare, byDateDesc } from '@/lib/naturalSort';

const SORT_OPTIONS = [
  { value: 'issued', label: 'Date issued (newest)' },
  { value: 'number', label: 'Invoice number' },
  { value: 'client', label: 'Client' },
  { value: 'amount', label: 'Amount (high to low)' },
];

const STATUS_STYLES = {
  draft: { bg: 'hsl(var(--border))', color: 'hsl(var(--primary))' },
  sent:  { bg: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' },
  paid:  { bg: '#2d5a27', color: '#edf5ec' },
  void:  { bg: '#fde8e8', color: '#7a2020' },
};

function fmt(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span
      className="font-highway text-xs px-2 py-0.5 uppercase tracking-wider font-semibold"
      style={{ background: s.bg, color: s.color, borderRadius: 4 }}
    >
      {status}
    </span>
  );
}

function InvoiceCard({ inv, onEdit, onDelete, onPrint, onPush, provider }) {
  const [pushing, setPushing] = useState(false);
  const doPush = async () => { setPushing(true); try { await onPush(inv); } finally { setPushing(false); } };
  const acct = provider === 'xero'
    ? { id: inv.xero_invoice_id, url: inv.xero_invoice_url, label: 'Xero', color: '#13B5EA' }
    : { id: inv.quickbooks_invoice_id, url: inv.quickbooks_invoice_url, label: 'QuickBooks', color: '#2CA01C' };
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition-shadow hover:shadow-md"
      style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, boxShadow: '0 1px 4px rgba(38,37,37,0.08)' }}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-butler font-semibold text-primary text-base">{inv.invoice_number || 'Draft'}</span>
          <StatusPill status={inv.status || 'draft'} />
        </div>
        <p className="font-highway text-sm text-muted-foreground">{inv.client_name} · {inv.project_name}</p>
        {inv.issue_date && (
          <p className="font-highway text-xs text-muted-foreground">
            Issued: {format(parseISO(inv.issue_date), 'MMM d, yyyy')}
            {inv.due_date ? ` · Due: ${format(parseISO(inv.due_date), 'MMM d, yyyy')}` : ''}
          </p>
        )}
      </div>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3 shrink-0">
        <span className="font-butler font-bold text-lg text-primary sm:text-right">{fmt(inv.grand_total)}</span>
        <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onPrint(inv)}
          className="font-highway text-xs px-3 py-1.5 transition-colors"
          style={{ border: '1px solid hsl(var(--primary))', color: 'hsl(var(--primary))', borderRadius: 4, background: 'transparent' }}
        >
          Print
        </button>
        {provider && (acct.id ? (
          <a
            href={acct.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="font-highway text-xs px-3 py-1.5 inline-flex items-center gap-1 transition-colors"
            style={{ border: `1px solid ${acct.color}`, color: acct.color, borderRadius: 4, background: 'transparent' }}
            title={`This invoice is in ${acct.label}`}
          >
            In {acct.label} <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <button
            onClick={doPush}
            disabled={pushing}
            className="font-highway text-xs px-3 py-1.5 inline-flex items-center gap-1 transition-colors disabled:opacity-60"
            style={{ border: `1px solid ${acct.color}`, color: acct.color, borderRadius: 4, background: 'transparent' }}
          >
            {pushing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {pushing ? 'Pushing…' : `Push to ${acct.label}`}
          </button>
        ))}
        <button
          onClick={() => onEdit(inv)}
          className="font-highway text-xs px-3 py-1.5 transition-colors"
          style={{ border: '1px solid hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', background: 'hsl(var(--primary))', borderRadius: 4 }}
        >
          <Eye className="w-3.5 h-3.5 inline mr-1" />View / Edit
        </button>
        <button
          onClick={() => onDelete(inv)}
          className="p-1.5 text-red-400 hover:text-red-600 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceList({ invoices, onEdit, onDelete, onPrint, onPush, provider }) {
  if (invoices.length === 0) {
    return (
      <div className="py-16 text-center" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}>
        <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
        <p className="font-highway text-muted-foreground">No invoices here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {invoices.map(inv => (
        <InvoiceCard key={inv.id} inv={inv} onEdit={onEdit} onDelete={onDelete} onPrint={onPrint} onPush={onPush} provider={provider} />
      ))}
    </div>
  );
}

const TABS = ['all', 'draft', 'sent', 'paid'];

export default function Invoices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [printingInvoice, setPrintingInvoice] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('issued');

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date', 200),
  });

  // Which accounting system this tenant has connected (drives the push button). One or none.
  const { data: provider = null } = useQuery({
    queryKey: ['accounting-provider'],
    queryFn: async () => {
      const [q, x] = await Promise.all([
        base44.functions.invoke('quickbooksAuth', { action: 'get_settings' }).catch(() => ({})),
        base44.functions.invoke('xeroAuth', { action: 'get_settings' }).catch(() => ({})),
      ]);
      if (q.data?.settings?.is_connected) return 'quickbooks';
      if (x.data?.settings?.is_connected) return 'xero';
      return null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleEdit = (inv) => { setEditingInvoice(inv); setShowForm(true); };
  const handleClose = () => { setShowForm(false); setEditingInvoice(null); };

  const handleDelete = async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_number || 'Draft'}? Any billed expenses on it will return to unbilled status.`)) return;
    await base44.entities.Invoice.delete(inv.id);
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  const [syncing, setSyncing] = useState(false);
  const handleSyncPayments = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('quickbooksReconcile', {});
      if (res.data?.error) throw new Error(res.data.error);
      const paid = res.data?.marked_paid || [];
      const checked = res.data?.checked ?? 0;
      if (paid.length) {
        toast({ title: `Marked ${paid.length} invoice${paid.length > 1 ? 's' : ''} paid`, description: paid.join(', ') });
      } else {
        toast({ title: 'Payments up to date', description: checked ? `Checked ${checked} open invoice${checked > 1 ? 's' : ''} against QuickBooks.` : 'No outstanding QuickBooks invoices to check.' });
      }
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      toast({ title: 'Payment sync failed', description: e?.message || String(e), variant: 'destructive' });
    }
    setSyncing(false);
  };

  const handlePush = async (inv) => {
    const label = provider === 'xero' ? 'Xero' : 'QuickBooks';
    const fn = provider === 'xero' ? 'xeroSyncV2' : 'quickbooksSyncV2';
    try {
      const res = await base44.functions.invoke(fn, { action: 'push_invoice', invoiceId: inv.id });
      if (res.data?.error) throw new Error(res.data.error);
      const warnings = res.data?.warnings || [];
      if (warnings.length) {
        toast({ title: 'Pushed with warnings', description: warnings.join(' '), variant: 'destructive' });
      } else {
        const sent = res.data?.emailed;
        const num = res.data?.doc_number || res.data?.invoice_number || '';
        toast({ title: `Pushed to ${label}`, description: `Invoice ${num} created${sent ? ' and emailed to the client' : ` as a draft to review in ${label}`}.` });
      }
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      toast({ title: `${label} push failed`, description: e?.message || String(e), variant: 'destructive' });
    }
  };

  const filtered = {
    all:   invoices,
    draft: invoices.filter(i => i.status === 'draft' || !i.status),
    sent:  invoices.filter(i => i.status === 'sent'),
    paid:  invoices.filter(i => i.status === 'paid'),
  };

  const q = search.trim().toLowerCase();
  const matchSearch = (i) => !q ||
    (i.invoice_number || '').toLowerCase().includes(q) ||
    (i.client_name || '').toLowerCase().includes(q) ||
    (i.project_name || '').toLowerCase().includes(q);
  const sortFn = (a, b) => {
    if (sort === 'number') return naturalCompare(a.invoice_number, b.invoice_number);
    if (sort === 'client') return naturalCompare(a.client_name, b.client_name);
    if (sort === 'amount') return (b.grand_total || 0) - (a.grand_total || 0);
    return byDateDesc('issue_date')(a, b);
  };
  const tabInvoices = (filtered[activeTab] || []).filter(matchSearch).sort(sortFn);

  if (printingInvoice) {
    return <InvoicePrintView invoice={printingInvoice} onBack={() => setPrintingInvoice(null)} />;
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-butler text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
            <FileText className="w-7 h-7" style={{ color: 'hsl(var(--primary))' }} /> Invoices
          </h1>
          <p className="font-highway text-sm text-muted-foreground mt-1">{invoices.length} total invoices</p>
        </div>
        <div className="flex items-center gap-2">
          {provider === 'quickbooks' && (
            <button
              onClick={handleSyncPayments}
              disabled={syncing}
              title="Check open invoices against QuickBooks and mark any paid ones paid"
              className="flex items-center gap-2 px-4 py-2 font-highway text-sm font-medium transition-colors border disabled:opacity-60"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))', borderRadius: 4 }}
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync Payments
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 font-highway text-sm font-medium transition-colors"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 4 }}
          >
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 font-highway text-muted-foreground">Loading...</div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 flex-wrap">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-2 font-highway text-sm font-medium capitalize transition-all"
                style={{
                  borderRadius: 4,
                  background: activeTab === tab ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                  color: activeTab === tab ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                  border: `1px solid ${activeTab === tab ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                }}
              >
                {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                <span className="ml-1.5 text-xs opacity-70">({filtered[tab]?.length || 0})</span>
              </button>
            ))}
          </div>

          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by invoice #, client, or project..."
            sort={sort}
            onSort={setSort}
            sortOptions={SORT_OPTIONS}
          />

          <InvoiceList invoices={tabInvoices} onEdit={handleEdit} onDelete={handleDelete} onPrint={setPrintingInvoice} onPush={handlePush} provider={provider} />
        </>
      )}

      <InvoiceFormDialog
        open={showForm}
        invoice={editingInvoice}
        onClose={handleClose}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          handleClose();
        }}
      />
    </div>
  );
}