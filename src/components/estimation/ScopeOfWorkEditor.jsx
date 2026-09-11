import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function ScopeOfWorkEditor({ items = [], onChange }) {
  const [newText, setNewText] = useState('');

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    onChange([...items, { id: uuidv4(), text }]);
    setNewText('');
  };

  const updateItem = (id, text) => {
    onChange(items.map(i => i.id === id ? { ...i, text } : i));
  };

  const removeItem = (id) => {
    onChange(items.filter(i => i.id !== id));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">
            No scope items yet. Add lines below.
          </p>
        )}
        {items.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-2 group">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
            <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}.</span>
            <Input
              value={item.text}
              onChange={e => updateItem(item.id, e.target.value)}
              className="h-7 text-sm flex-1"
              placeholder="Scope item..."
            />
            <button
              onClick={() => removeItem(item.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <Input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a scope item..."
          className="h-8 text-sm flex-1"
        />
        <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}