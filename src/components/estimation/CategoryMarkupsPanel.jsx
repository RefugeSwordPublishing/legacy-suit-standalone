import { Input } from '@/components/ui/input';

const CATEGORIES = ['materials', 'labor', 'subcontractor', 'other'];

export default function CategoryMarkupsPanel({ markups, onChange }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Default Category Markups</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CATEGORIES.map(cat => (
          <div key={cat}>
            <label className="text-xs text-muted-foreground capitalize block mb-1">{cat}</label>
            <div className="relative">
              <Input
                type="number"
                min="0"
                max="200"
                value={markups?.[cat] ?? 0}
                onChange={e => onChange({ ...markups, [cat]: parseFloat(e.target.value) || 0 })}
                className="pr-7"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}