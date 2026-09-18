import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { canAddMaterials, canUpdateMaterialStatus, canDeleteMaterials, canEditMaterials } from '@/lib/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Package, Truck, ShoppingCart, Trash2, Pencil, X, ChevronDown, ChevronRight } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import QuickMaterialRequestDialog from '@/components/materials/QuickMaterialRequestDialog';

const statusConfig = {
  needed: { label: 'Needed', icon: ShoppingCart, className: 'bg-red-100 text-red-700 border-red-200' },
  ordered: { label: 'Ordered', icon: Package, className: 'bg-amber-100 text-amber-700 border-amber-200' },
  delivered: { label: 'Delivered', icon: Truck, className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const priorityConfig = {
  low: { label: 'Low', className: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Med', className: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700' },
};

const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };

function MaterialCard({ mat, canUpdateStatus, canEdit, canDelete, updateStatus, openEdit, deleteMaterial }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sc = statusConfig[mat.status] || statusConfig.needed;
  const pc = priorityConfig[mat.priority] || priorityConfig.medium;
  const StatusIcon = sc.icon;
  return (
    <motion.div
      key={mat.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
    >
      <StatusIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{mat.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {mat.quantity && <span>{mat.quantity} {mat.unit}</span>}
          {mat.supplier && <span>· {mat.supplier}</span>}
          {mat.estimated_cost && <span>· ${Number(mat.estimated_cost).toFixed(2)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Badge variant="outline" className={`${pc.className} text-xs`}>{pc.label}</Badge>
          {canUpdateStatus ? (
            <Select value={mat.status} onValueChange={(val) => updateStatus(mat.id, val)}>
              <SelectTrigger className="h-5 text-xs border-0 p-0 focus:ring-0 w-auto">
                <Badge variant="outline" className={`${sc.className} text-xs`}>{sc.label}</Badge>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="needed">Needed</SelectItem>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className={`${sc.className} text-xs`}>{sc.label}</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {canEdit && (
          <button onClick={() => openEdit(mat)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {canDelete && (
          <button onClick={() => setConfirmDelete(true)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete material?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMaterial(mat.id)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </motion.div>
  );
}

const emptyMaterial = { name: '', quantity: '', unit: '', priority: 'medium', status: 'needed', supplier: '', estimated_cost: '', notes: '' };

export default function MaterialsList({ materials, projectId, projectName, onRefresh }) {
  const { currentUser } = useCurrentUser();
  const [open, setOpen] = useState(false);        // edit dialog
  const [addOpen, setAddOpen] = useState(false);  // add via the shared request dialog
  const [editingMat, setEditingMat] = useState(null);
  const [form, setForm] = useState(emptyMaterial); // single form for edit
  const [filter, setFilter] = useState('all');
  const [deliveredExpanded, setDeliveredExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const openAdd = () => setAddOpen(true);
  const openEdit = (mat) => {
    setEditingMat(mat);
    setForm({ name: mat.name, quantity: mat.quantity || '', unit: mat.unit || '', priority: mat.priority || 'medium', status: mat.status || 'needed', supplier: mat.supplier || '', estimated_cost: mat.estimated_cost || '', notes: mat.notes || '' });
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = {
      ...form,
      quantity: form.quantity ? Number(form.quantity) : undefined,
      estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : undefined,
    };
    await base44.entities.Material.update(editingMat.id, data);
    setForm(emptyMaterial);
    setEditingMat(null);
    setOpen(false);
    setSaving(false);
    onRefresh();
  };

  const updateStatus = async (id, newStatus) => {
    await base44.entities.Material.update(id, { status: newStatus });
    onRefresh();
  };

  const deleteMaterial = async (id) => {
    await base44.entities.Material.delete(id);
    onRefresh();
  };

  // Newest first
  const sorted = [...materials].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  const filtered = filter === 'all' ? sorted : sorted.filter(m => m.status === filter);
  const activeItems = filtered.filter(m => m.status !== 'delivered');
  const deliveredItems = filtered.filter(m => m.status === 'delivered');

  const canAdd = canAddMaterials(currentUser);
  const canUpdateStatus = canUpdateMaterialStatus(currentUser);
  const canDelete = canDeleteMaterials(currentUser);
  const canEdit = canEditMaterials(currentUser);

  return (
    <>
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5 text-accent" />
            Materials
            <span className="text-sm font-normal text-muted-foreground">({materials.length})</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="needed">Needed</SelectItem>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
            {canAdd && (
              <>
                <Button size="sm" className="h-8 bg-accent text-accent-foreground hover:bg-accent/90" onClick={openAdd}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
                <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingMat ? 'Edit Material' : 'Add Materials'}</DialogTitle>
                  </DialogHeader>

                  {editingMat ? (
                    /* Single edit form */
                    <div className="space-y-3">
                      <div>
                        <Label>Name *</Label>
                        <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. 2x4 Lumber" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
                        <div><Label>Unit</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs, ft, bags" /></div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label>Priority</Label>
                          <Select value={form.priority} onValueChange={val => setForm({ ...form, priority: val })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Supplier</Label><Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Store name" /></div>
                      </div>
                      <div><Label>Est. Cost</Label><Input type="number" value={form.estimated_cost} onChange={e => setForm({ ...form, estimated_cost: e.target.value })} placeholder="$0.00" /></div>
                      <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional details" /></div>
                      <Button onClick={handleSave} disabled={!form.name || saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  ) : null}
                </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No materials yet.</p>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {activeItems.map(mat => <MaterialCard key={mat.id} mat={mat} canUpdateStatus={canUpdateStatus} canEdit={canEdit} canDelete={canDelete} updateStatus={updateStatus} openEdit={openEdit} deleteMaterial={deleteMaterial} />)}
            </AnimatePresence>

            {deliveredItems.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setDeliveredExpanded(p => !p)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-1.5 border-t border-border"
                >
                  {deliveredExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <Truck className="w-3.5 h-3.5" />
                  <span>Delivered ({deliveredItems.length})</span>
                </button>
                <AnimatePresence>
                  {deliveredExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 mt-2 overflow-hidden"
                    >
                      {deliveredItems.map(mat => <MaterialCard key={mat.id} mat={mat} canUpdateStatus={canUpdateStatus} canEdit={canEdit} canDelete={canDelete} updateStatus={updateStatus} openEdit={openEdit} deleteMaterial={deleteMaterial} />)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    <QuickMaterialRequestDialog
      open={addOpen}
      onOpenChange={setAddOpen}
      projects={[]}
      lockedProject={{ id: projectId, name: projectName }}
      onSaved={() => { setAddOpen(false); onRefresh(); }}
    />
    </>
  );
}