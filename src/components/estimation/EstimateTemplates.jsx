import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Copy, LayoutTemplate, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_MARKUPS = { materials: 20, labor: 15, subcontractor: 10, other: 0 };

export default function EstimateTemplates() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [cloning, setCloning] = useState(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['estimate-templates'],
    queryFn: () => base44.entities.EstimateTemplate.list('-created_date', 100),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['estimate-templates'] });

  const handleDelete = async () => {
    await base44.entities.EstimateTemplate.delete(deleteTarget.id);
    setDeleteTarget(null);
    refresh();
    toast({ title: 'Template deleted' });
  };

  const handleUseTemplate = async (tmpl) => {
    setCloning(tmpl.id);
    try {
      // Deep clone sections with fresh IDs
      const sections = (tmpl.sections || []).map(s => ({
        ...s,
        id: uuidv4(),
        line_items: (s.line_items || []).map(li => ({ ...li, id: uuidv4() })),
      }));
      const allItems = sections.flatMap(s => s.line_items || []);
      const subtotal = allItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
      const grandTotal = allItems.reduce((s, i) => s + (i.line_total || 0), 0);

      const created = await base44.entities.Estimate.create({
        title: tmpl.name,
        status: 'draft',
        category_markups: tmpl.category_markups || { ...DEFAULT_MARKUPS },
        sections,
        subtotal,
        total_markup: grandTotal - subtotal,
        grand_total: grandTotal,
      });
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      navigate(`/estimates/${created.id}`);
    } finally {
      setCloning(null);
    }
  };

  const totalItems = (tmpl) => (tmpl.sections || []).reduce((s, sec) => s + (sec.line_items || []).length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        <Button onClick={() => navigate('/estimates/templates/new')} className="gap-2">
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <LayoutTemplate className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No templates yet. Create one to speed up future estimates.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(tmpl => (
            <div key={tmpl.id} className="bg-card border border-border rounded-lg px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-foreground">{tmpl.name}</span>
                  <Badge variant="outline" className="text-xs">{(tmpl.sections || []).length} sections</Badge>
                  <Badge variant="outline" className="text-xs">{totalItems(tmpl)} items</Badge>
                </div>
                {tmpl.description && (
                  <p className="text-sm text-muted-foreground truncate">{tmpl.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline" size="sm" className="gap-1.5"
                  onClick={() => handleUseTemplate(tmpl)}
                  disabled={cloning === tmpl.id}
                >
                  {cloning === tmpl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                  Use
                </Button>
                <Button variant="ghost" size="icon" onClick={() => navigate(`/estimates/templates/${tmpl.id}`)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(tmpl)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <AlertDialog open onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleteTarget.name}"?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}