import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';

export default function ImportTemplateDialog({ open, onOpenChange, onImport }) {
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['estimate-templates'],
    queryFn: () => base44.entities.EstimateTemplate.list('name', 100),
    enabled: open,
  });

  const handleSelect = (template) => {
    onImport({
      sections: (template.sections || []).map(s => ({
        ...s,
        id: s.id || crypto.randomUUID(),
        line_items: (s.line_items || []).map(li => ({ ...li, id: li.id || crypto.randomUUID() })),
      })),
      category_markups: template.category_markups || {},
      scope_of_work: [], // templates don't store scope; keep existing or empty
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Template</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No templates found.</p>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => handleSelect(t)}
                className="w-full text-left flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <FileText className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(t.sections || []).length} section{(t.sections || []).length !== 1 ? 's' : ''} · {(t.sections || []).flatMap(s => s.line_items || []).length} items
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}