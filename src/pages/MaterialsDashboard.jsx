import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useCurrentUser } from '@/lib/UserContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Package, ShoppingCart, Truck, AlertTriangle, ShoppingBasket, ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const statusConfig = {
  needed: { label: 'Needed', icon: ShoppingCart, className: 'bg-red-100 text-red-700 border-red-200' },
  in_cart: { label: 'In Cart', icon: ShoppingBasket, className: 'bg-blue-100 text-blue-700 border-blue-200' },
  ordered: { label: 'Ordered', icon: Package, className: 'bg-amber-100 text-amber-700 border-amber-200' },
  delivered: { label: 'Delivered', icon: Truck, className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const priorityConfig = {
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700', order: 0 },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700', order: 1 },
  medium: { label: 'Medium', className: 'bg-blue-100 text-blue-700', order: 2 },
  low: { label: 'Low', className: 'bg-slate-100 text-slate-600', order: 3 },
};

function MaterialRow({ mat, updateStatus, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sc = statusConfig[mat.status] || statusConfig.needed;
  const pc = priorityConfig[mat.priority] || priorityConfig.medium;
  const isInCart = mat.status === 'in_cart';
  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group ${isInCart ? 'bg-blue-50/50' : ''}`}>
      <Checkbox
        checked={isInCart}
        onCheckedChange={(checked) => updateStatus(mat.id, checked ? 'in_cart' : 'needed')}
        className="shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{mat.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {mat.quantity && <span>{mat.quantity} {mat.unit}</span>}
          {mat.supplier && <span>· {mat.supplier}</span>}
          {mat.estimated_cost && <span>· ${Number(mat.estimated_cost).toFixed(2)}</span>}
          {mat.notes && <span>· {mat.notes}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className={`${pc.className} text-xs`}>{pc.label}</Badge>
        <Badge variant="outline" className={`${sc.className} text-xs`}>{sc.label}</Badge>
        <button onClick={() => onEdit(mat)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all ml-1">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        {onDelete && (
          <button onClick={() => setConfirmDelete(true)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all ml-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete material?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(mat.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MaterialsSection({ title, projects, updateStatus, markSelectedDelivered, onEdit, onDelete, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  if (projects.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-accent transition-colors mb-3 w-full"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        {title} ({projects.length})
      </button>
      {open && (
        <ProjectMaterialsList
          projectsWithMaterials={projects}
          updateStatus={updateStatus}
          markSelectedDelivered={markSelectedDelivered}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function ProjectMaterialsList({ projectsWithMaterials, updateStatus, markSelectedDelivered, onEdit, onDelete }) {
  const [expandedDelivered, setExpandedDelivered] = useState({});

  return (
    <div className="space-y-6">
      {projectsWithMaterials.map(project => {
        const activeItems = project.materials.filter(m => m.status !== 'delivered');
        const deliveredItems = project.materials.filter(m => m.status === 'delivered');
        const inCartIds = activeItems.filter(m => m.status === 'in_cart').map(m => m.id);
        const isDeliveredOpen = expandedDelivered[project.id];

        return (
          <Card key={project.id} className="border border-border overflow-hidden">
            <CardHeader className="pb-3 bg-muted/30 border-b">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base font-semibold">{project.name}</CardTitle>
                  {project.client_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{project.client_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{project.materials.length} items</Badge>
                  {activeItems.length > 0 && (
                    <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">
                      {activeItems.length} pending
                    </Badge>
                  )}
                  {inCartIds.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => markSelectedDelivered(inCartIds)}
                    >
                      <Truck className="w-3 h-3 mr-1" />
                      Mark {inCartIds.length} Delivered
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {activeItems.map(mat => (
                  <MaterialRow key={mat.id} mat={mat} updateStatus={updateStatus} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </div>
              {deliveredItems.length > 0 && (
                <div className="border-t border-border">
                  <button
                    onClick={() => setExpandedDelivered(prev => ({ ...prev, [project.id]: !prev[project.id] }))}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
                  >
                    {isDeliveredOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <Truck className="w-3.5 h-3.5 text-emerald-600" />
                    Delivered ({deliveredItems.length})
                  </button>
                  {isDeliveredOpen && (
                    <div className="divide-y divide-border bg-emerald-50/30">
                      {deliveredItems.map(mat => {
                        const sc = statusConfig.delivered;
                        const pc = priorityConfig[mat.priority] || priorityConfig.medium;
                        return (
                          <div key={mat.id} className="flex items-center gap-3 px-4 py-3">
                            <Checkbox checked disabled className="shrink-0 opacity-50" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium line-through text-muted-foreground">{mat.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {mat.quantity && <span>{mat.quantity} {mat.unit}</span>}
                                {mat.supplier && <span>· {mat.supplier}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className={`${pc.className} text-xs`}>{pc.label}</Badge>
                              <Badge variant="outline" className={`${sc.className} text-xs`}>{sc.label}</Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const emptyForm = { name: '', quantity: '', unit: '', priority: 'medium', status: 'needed', supplier: '', estimated_cost: '', notes: '' };

export default function MaterialsDashboard() {
  const queryClient = useQueryClient();
  const [editingMat, setEditingMat] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: allMaterials = [], isLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: () => base44.entities.Material.list(),
  });

  const updateStatus = async (id, status) => {
    await base44.entities.Material.update(id, { status });
    queryClient.invalidateQueries({ queryKey: ['materials'] });
  };

  const markSelectedDelivered = async (ids) => {
    await Promise.all(ids.map(id => base44.entities.Material.update(id, { status: 'delivered' })));
    queryClient.invalidateQueries({ queryKey: ['materials'] });
  };

  const deleteMaterial = async (id) => {
    await base44.entities.Material.delete(id);
    queryClient.invalidateQueries({ queryKey: ['materials'] });
  };

  const openEdit = (mat) => {
    setForm({ name: mat.name, quantity: mat.quantity || '', unit: mat.unit || '', priority: mat.priority || 'medium', status: mat.status || 'needed', supplier: mat.supplier || '', estimated_cost: mat.estimated_cost || '', notes: mat.notes || '' });
    setEditingMat(mat);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    await base44.entities.Material.update(editingMat.id, {
      ...form,
      quantity: form.quantity ? Number(form.quantity) : undefined,
      estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : undefined,
    });
    queryClient.invalidateQueries({ queryKey: ['materials'] });
    setEditingMat(null);
    setSaving(false);
  };

  // Stats
  const needed = allMaterials.filter(m => m.status === 'needed');
  const inCart = allMaterials.filter(m => m.status === 'in_cart');
  const ordered = allMaterials.filter(m => m.status === 'ordered');
  const urgent = allMaterials.filter(m => m.priority === 'urgent' && m.status !== 'delivered');

  // Group by project, sorted by priority within each project
  const buildProjectList = (statuses) =>
    projects
      .filter(p => statuses.includes(p.status))
      .map(p => ({
        ...p,
        materials: allMaterials
          .filter(m => m.project_id === p.id)
          .sort((a, b) =>
            (priorityConfig[a.priority]?.order ?? 2) - (priorityConfig[b.priority]?.order ?? 2)
          ),
      }))
      .filter(p => p.materials.length > 0);

  const planningProjects = buildProjectList(['planning']);
  const activeProjects = buildProjectList(['active']);
  const completedProjects = buildProjectList(['completed', 'on_hold']);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Materials Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">All materials across every project, sorted by priority</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Needed', value: needed.length, icon: ShoppingCart, bg: 'bg-red-50', color: 'text-red-600' },
          { label: 'In Cart', value: inCart.length, icon: ShoppingBasket, bg: 'bg-blue-50', color: 'text-blue-600' },
          { label: 'Ordered', value: ordered.length, icon: Package, bg: 'bg-amber-50', color: 'text-amber-600' },
          { label: 'Urgent', value: urgent.length, icon: AlertTriangle, bg: 'bg-red-50', color: 'text-red-600' },
        ].map((stat, i) => (
          <Card key={i} className="p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : (planningProjects.length === 0 && activeProjects.length === 0 && completedProjects.length === 0) ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">No materials yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Materials added to projects will appear here</p>
        </div>
      ) : (
        <div className="space-y-8">
          <MaterialsSection title="Planning" projects={planningProjects} updateStatus={updateStatus} markSelectedDelivered={markSelectedDelivered} onEdit={openEdit} onDelete={deleteMaterial} defaultOpen={false} />
          <MaterialsSection title="Active" projects={activeProjects} updateStatus={updateStatus} markSelectedDelivered={markSelectedDelivered} onEdit={openEdit} onDelete={deleteMaterial} defaultOpen={true} />
          <MaterialsSection title="Completed / On Hold" projects={completedProjects} updateStatus={updateStatus} markSelectedDelivered={markSelectedDelivered} onEdit={openEdit} onDelete={deleteMaterial} defaultOpen={false} />
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingMat} onOpenChange={open => { if (!open) setEditingMat(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Quantity</Label>
                <Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs, ft, bags" />
              </div>
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
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={val => setForm({ ...form, status: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="needed">Needed</SelectItem>
                    <SelectItem value="in_cart">In Cart</SelectItem>
                    <SelectItem value="ordered">Ordered</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Store name" />
              </div>
              <div>
                <Label>Est. Cost</Label>
                <Input type="number" value={form.estimated_cost} onChange={e => setForm({ ...form, estimated_cost: e.target.value })} placeholder="$0.00" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button onClick={handleSaveEdit} disabled={!form.name || saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}