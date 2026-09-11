import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Reusable search + sort row for list screens (projects, invoices, subs, clients, estimates).
// `sortOptions` is an array of { value, label }. Sort is optional; omit sortOptions to show search only.
export default function ListToolbar({
  search,
  onSearch,
  placeholder = 'Search...',
  sort,
  onSort,
  sortOptions,
  className = '',
}) {
  return (
    <div className={`flex flex-col sm:flex-row gap-2 ${className}`}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => onSearch(e.target.value)} placeholder={placeholder} className="pl-9" />
      </div>
      {sortOptions?.length > 0 && (
        <Select value={sort} onValueChange={onSort}>
          <SelectTrigger className="sm:w-52 shrink-0">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
