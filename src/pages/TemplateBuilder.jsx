import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, Loader2, Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import CategoryMarkupsPanel from '@/components/estimation/CategoryMarkupsPanel';
import SectionsEditor from '@/components/estimation/SectionsEditor';
import EstimateSummaryPanel from '@/components/estimation/EstimateSummaryPanel';

const DEFAULT_MARKUPS = { materials: 20, labor: 15, subcontractor: 10, other: 0 };

export default function TemplateBuilder() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    is_rapid_estimate: false,
    category_markups: { ...DEFAULT_MARKUPS },
    sections: [],
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ['estimate-template', id],
    queryFn: () => base44.entities.EstimateTemplate.get(id),
    enabled: !isNew,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name || '',
        description: existing.description || '',
        is_rapid_estimate: existing.is_rapid_estimate || false,
        category_markups: existing.category_markups || { ...DEFAULT_MARKUPS },
        sections: existing.sections || [],
      });
    }
  }, [existing]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await base44.entities.EstimateTemplate.create(form);
        queryClient.invalidateQueries({ queryKey: ['estimate-templates'] });
        navigate(`/estimates/templates/${created.id}`, { replace: true });
        toast({ title: 'Template created' });
      } else if (id) {
        await base44.entities.EstimateTemplate.update(id, form);
        queryClient.invalidateQueries({ queryKey: ['estimate-templates'] });
        queryClient.invalidateQueries({ queryKey: ['estimate-template', id] });
        toast({ title: 'Template saved' });
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isNew && isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/estimates?tab=templates">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <Input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Template name..."
            className="text-lg font-semibold border-0 shadow-none px-0 h-auto focus-visible:ring-0 bg-transparent"
          />
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </Button>
      </div>

      {/* Rapid Estimate Toggle */}
      <div className="flex items-center gap-3 mb-4 bg-card border border-border rounded-lg px-4 py-3">
        <Zap className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium">Rapid Estimate Template</div>
          <div className="text-xs text-muted-foreground">Walk through a job site and count quantities, costs and markups are pulled automatically.</div>
        </div>
        <Switch
          checked={form.is_rapid_estimate}
          onCheckedChange={v => setForm(f => ({ ...f, is_rapid_estimate: v }))}
        />
      </div>

      {/* Description */}
      <div className="mb-4">
        <Textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Template description (optional)..."
          className="h-14 resize-none text-sm"
        />
      </div>

      {/* Category Markups */}
      <div className="mb-4">
        <CategoryMarkupsPanel
          markups={form.category_markups}
          onChange={markups => setForm(f => ({ ...f, category_markups: markups }))}
        />
      </div>

      {/* Sections + Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
        <SectionsEditor
          sections={form.sections}
          onChange={sections => setForm(f => ({ ...f, sections }))}
          categoryMarkups={form.category_markups}
          showQuickCount
        />
        <EstimateSummaryPanel sections={form.sections} />
      </div>
    </div>
  );
}