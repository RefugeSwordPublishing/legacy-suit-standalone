import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, Users } from 'lucide-react';
import { userFullName } from '@/lib/taskAssignees';

// Multi-select assignee picker (shared by every task UI so they stay consistent). `value` is an
// array of full names; `onChange` gets the new array. `users` are the assignable user profiles.
export default function AssigneeSelect({ value = [], onChange, users = [], placeholder = 'Assign to…' }) {
  const [open, setOpen] = useState(false);
  const selected = value.filter(Boolean);
  const toggle = (name) => onChange(selected.includes(name) ? selected.filter(n => n !== name) : [...selected, name]);
  const label = selected.length === 0
    ? placeholder
    : selected.length <= 2 ? selected.join(', ') : `${selected.slice(0, 2).join(', ')} +${selected.length - 2}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <span className={`flex items-center gap-1.5 truncate ${selected.length ? 'text-foreground' : 'text-muted-foreground'}`}>
            <Users className="w-3.5 h-3.5 shrink-0 opacity-70" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 w-[--radix-popover-trigger-width] min-w-56 max-h-64 overflow-y-auto" align="start">
        {users.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">No people to assign.</p>
        ) : users.map(u => {
          const name = userFullName(u);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(name)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left text-sm"
            >
              <Checkbox checked={selected.includes(name)} className="pointer-events-none shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
