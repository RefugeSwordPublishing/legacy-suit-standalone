import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';

const CATEGORY_COLORS = {
  materials: 'bg-blue-100 text-blue-800',
  labor: 'bg-green-100 text-green-800',
  subcontractor: 'bg-orange-100 text-orange-800',
  other: 'bg-muted text-muted-foreground',
};

export default function CatalogPickerDialog({ open, onOpenChange, onSelect }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const { data: items = [] } = useQuery({
    queryKey: ['catalog-items'],
    queryFn: () => base44.entities.CatalogItem.filter({ is_active: true }, 'name', 500),
    enabled: open,
  });

  const filtered = items.filter(item => {
    const matchesSearch =
      item.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const handleSelect = (item) => {
    onSelect(item);
    onOpenChange(false);
    setSearch('');
    setCategoryFilter('all');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add from Catalog</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search catalog..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'materials', 'labor', 'subcontractor', 'other'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  categoryFilter === cat
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1 mt-2">
          {Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1 capitalize">{cat}</p>
              {catItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <Badge className={`text-xs ${CATEGORY_COLORS[item.category] || ''}`}>
                        {item.category}
                      </Badge>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {item.unit_cost > 0 && (
                      <div className="text-sm font-semibold">${item.unit_cost}/{item.unit || 'ea'}</div>
                    )}
                    {item.default_markup > 0 && (
                      <div className="text-xs text-muted-foreground">{item.default_markup}% markup</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {items.length === 0 ? 'No catalog items yet. Add some in the Catalog tab.' : 'No items match your search.'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}