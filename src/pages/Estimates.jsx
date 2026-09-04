import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, FileText, Zap, Trash2, GitBranch, Settings2 } from 'lucide-react';
import EstimateTemplates from '@/components/estimation/EstimateTemplates';
import RapidEstimateWizard from '@/components/estimation/RapidEstimateWizard';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import ListToolbar from '@/components/shared/ListToolbar';
import { naturalCompare, byDateDesc } from '@/lib/naturalSort';

const EST_SORT_OPTIONS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'client', label: 'Client' },
  { value: 'amount', label: 'Amount (high to low)' },
];

function calcEstimateTotal(est) {
  const subtotal = (est.sections || [])
    .flatMap(s => s.line_items || s.items || [])
    .reduce((sum, i) => sum + (i.line_total || i.total || 0), 0);
  const gcFee = est.gc_fee_enabled ? subtotal * ((est.gc_fee_pct || 0) / 100) : 0;
  return subtotal + gcFee;
}

const STATUS_COLORS = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export default function Estimates() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [activeTab, setActiveTab] = useState('estimates');
  const [rapidOpen, setRapidOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [laborHourRate, setLaborHourRate] = useState(() => {
    const saved = localStorage.getItem('estimateLaborHourRate');
    return saved ? Number(saved) : 40;
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleLaborRateChange = (val) => {
    const num = Number(val);
    setLaborHourRate(num);
    localStorage.setItem('estimateLaborHourRate', String(num));
  };

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => base44.entities.Estimate.list('-created_date', 100),
  });

  const { data: changeOrders = [], isLoading: loadingCOs } = useQuery({
    queryKey: ['client-change-orders'],
    queryFn: () => base44.entities.ClientChangeOrder.list('-created_date', 100),
  });

  const handleNewChangeOrder = async () => {
    const co = await base44.entities.ClientChangeOrder.create({
      status: 'draft',
      title: 'New Change Order',
      estimate_id: 'pending',
    });
    navigate(`/change-orders/${co.id}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.Estimate.delete(deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: ['estimates'] });
    setDeleteTarget(null);
  };

  const estSortFn = (a, b) => {
    if (sort === 'title') return naturalCompare(a.title, b.title);
    if (sort === 'client') return naturalCompare(a.client_name, b.client_name);
    if (sort === 'amount') return calcEstimateTotal(b) - calcEstimateTotal(a);
    return byDateDesc('created_date')(a, b);
  };
  const filtered = estimates.filter(e =>
    e.title?.toLowerCase().includes(search.toLowerCase()) ||
    e.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.project_name?.toLowerCase().includes(search.toLowerCase())
  ).sort(estSortFn);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold font-butler">Estimates</h1>
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Estimate Settings">
                <Settings2 className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-4" align="start">
              <p className="text-sm font-semibold mb-3">Estimate Settings</p>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Labor Hour Rate ($/hr)</Label>
                <Input
                  type="number"
                  min={1}
                  value={laborHourRate}
                  onChange={e => handleLaborRateChange(e.target.value)}
                  className="h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Used to calculate budget hours when creating a project from an approved estimate.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col items-end gap-2">
          {activeTab === 'change-orders' ? (
            <Button className="gap-2" onClick={handleNewChangeOrder}>
              <Plus className="w-4 h-4" />
              New Change Order
            </Button>
          ) : (
            <>
              <Link to="/estimates/new">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Estimate
                </Button>
              </Link>
              <Button variant="outline" onClick={() => setRapidOpen(true)} className="gap-2 text-sm border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                <Zap className="w-4 h-4" />
                Rapid Estimate
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="estimates" onValueChange={setActiveTab}>
        <TabsList className="mb-5 w-full max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="estimates" className="shrink-0">Estimates</TabsTrigger>
          <TabsTrigger value="change-orders" className="shrink-0">Change Orders</TabsTrigger>
          <TabsTrigger value="templates" className="shrink-0">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="estimates">
          <ListToolbar
            className="mb-4"
            search={search}
            onSearch={setSearch}
            placeholder="Search by title, client, or project..."
            sort={sort}
            onSort={setSort}
            sortOptions={EST_SORT_OPTIONS}
          />

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No estimates yet. Create your first one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(est => (
                <div key={est.id} className="relative group">
                  <Link to={`/estimates/${est.id}`}>
                    <div className="bg-card border border-border rounded-lg px-5 py-4 hover:shadow-md transition-shadow flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-semibold text-foreground truncate">{est.title}</span>
                          <Badge className={`text-xs capitalize shrink-0 ${STATUS_COLORS[est.status] || ''}`}>
                            {est.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground flex gap-3 flex-wrap">
                          {est.client_name && <span>Client: {est.client_name}</span>}
                          {est.project_name && <span>Project: {est.project_name}</span>}
                          {!est.client_name && !est.project_name && <span>Standalone draft</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 pr-8">
                        <div className="text-lg font-bold text-foreground">
                          ${calcEstimateTotal(est).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs text-muted-foreground">{(est.sections || []).flatMap(s => s.line_items || []).length || (est.line_items || []).length} line items</div>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={e => { e.preventDefault(); setDeleteTarget(est); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="change-orders">
          {loadingCOs ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : changeOrders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No change orders yet.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3">#</th>
                      <th className="text-left px-4 py-3">Title</th>
                      <th className="text-left px-4 py-3">Estimate</th>
                      <th className="text-left px-4 py-3">Client</th>
                      <th className="text-right px-4 py-3">CO Total</th>
                      <th className="text-right px-4 py-3">New Contract</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Date Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changeOrders.map(co => (
                      <tr
                        key={co.id}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => navigate(`/change-orders/${co.id}`)}
                      >
                        <td className="px-4 py-3 text-muted-foreground">{co.change_order_number || ''}</td>
                        <td className="px-4 py-3 font-medium">{co.title || 'Untitled'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{co.estimate_number || ''}</td>
                        <td className="px-4 py-3">{co.client_name || ''}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {co.change_order_total != null ? `$${co.change_order_total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {co.new_contract_total != null ? `$${co.new_contract_total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs capitalize ${STATUS_COLORS[co.status] || ''}`}>
                            {co.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{co.date_issued || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>

              {/* Mobile cards (mirrors the Estimates list) */}
              <div className="md:hidden space-y-3">
                {changeOrders.map(co => (
                  <div
                    key={co.id}
                    onClick={() => navigate(`/change-orders/${co.id}`)}
                    className="bg-card border border-border rounded-lg px-4 py-3 cursor-pointer active:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-foreground">{co.title || 'Untitled'}</span>
                          <Badge className={`text-xs capitalize shrink-0 ${STATUS_COLORS[co.status] || ''}`}>
                            {co.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                          {co.change_order_number && <span>{co.change_order_number}</span>}
                          {co.estimate_number && <span>· {co.estimate_number}</span>}
                          {co.client_name && <span>· {co.client_name}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {co.change_order_total != null && (
                          <div className="font-bold text-foreground">
                            ${co.change_order_total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                        {co.new_contract_total != null && (
                          <div className="text-[11px] text-muted-foreground">
                            New: ${co.new_contract_total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    </div>
                    {co.date_issued && <div className="text-[11px] text-muted-foreground mt-1.5">Issued {co.date_issued}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="templates">
          <EstimateTemplates />
        </TabsContent>

      </Tabs>
      <RapidEstimateWizard open={rapidOpen} onOpenChange={setRapidOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Estimate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{deleteTarget?.title}"</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}