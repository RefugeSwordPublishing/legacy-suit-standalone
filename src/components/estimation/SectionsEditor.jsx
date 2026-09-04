import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Plus, Trash2, GripVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import SectionLineItemsTable from './SectionLineItemsTable';

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SectionsEditor({ sections, onChange, categoryMarkups, autoLaborLine = false, showQuickCount = false }) {
  const [collapsed, setCollapsed] = useState({});

  const toggleCollapse = (id) => setCollapsed(c => ({ ...c, [id]: !c[id] }));

  const addSection = () => {
    onChange([...sections, { id: uuidv4(), name: 'New Section', line_items: [] }]);
  };

  const updateSectionName = (id, name) => {
    onChange(sections.map(s => s.id === id ? { ...s, name } : s));
  };

  const updateSectionItems = (id, items) => {
    onChange(sections.map(s => s.id === id ? { ...s, line_items: items } : s));
  };

  const removeSection = (id) => {
    onChange(sections.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-3">
      {sections.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
          No sections yet. Add a section to start building your estimate.
        </div>
      )}

      {sections.map((section, idx) => {
        const isCollapsed = collapsed[section.id];
        const sectionTotal = (section.line_items || []).reduce((s, i) => s + (i.line_total || 0), 0);

        return (
          <div key={section.id} className="bg-card border border-border rounded-lg overflow-hidden">
            {/* Section Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border">
              <GripVertical className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              <button
                onClick={() => toggleCollapse(section.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4" />
                  : <ChevronDown className="w-4 h-4" />}
              </button>
              <Input
                value={section.name}
                onChange={e => updateSectionName(section.id, e.target.value)}
                className="flex-1 h-7 font-semibold text-sm border-0 shadow-none px-1 bg-transparent focus-visible:ring-0"
                placeholder="Section name..."
              />
              <span className="text-sm font-bold text-foreground shrink-0 mr-2">
                ${fmt(sectionTotal)}
              </span>
              <button
                onClick={() => removeSection(section.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Section Body */}
            {!isCollapsed && (
              <div className="p-4">
                <SectionLineItemsTable
                  items={section.line_items || []}
                  onChange={(items) => updateSectionItems(section.id, items)}
                  categoryMarkups={categoryMarkups}
                  autoLaborLine={autoLaborLine}
                  showQuickCount={showQuickCount}
                />
              </div>
            )}
          </div>
        );
      })}

      <Button variant="outline" onClick={addSection} className="w-full gap-2 border-dashed">
        <Plus className="w-4 h-4" />
        Add Section
      </Button>
    </div>
  );
}