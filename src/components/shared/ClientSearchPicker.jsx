import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Search, X, UserPlus } from 'lucide-react';
import ClientFormDialog from '@/components/estimation/ClientFormDialog';

/**
 * ClientSearchPicker
 *
 * Props:
 *   mode="id", value/onChange work with client id + returns {id, name} via onClientSelect
 *   mode="name", value/onChange work with plain client name string (for ProjectFormDialog)
 *
 *   value, current selected value (id or name string)
 *   onChange, called with new value (id or name string)
 *   onClientSelect(client), optional, called with full client object on select (mode="id" only)
 */
export default function ClientSearchPicker({ value, onChange, onClientSelect, mode = 'id', placeholder = 'Search clients...' }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const containerRef = useRef(null);

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('name', 200),
  });

  // Resolve display name from value
  const selectedClient = mode === 'id'
    ? clients.find(c => c.id === value) || null
    : null;
  const displayName = mode === 'id' ? (selectedClient?.name || '') : (value || '');

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.contact_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (client) => {
    if (mode === 'id') {
      onChange(client.id);
      onClientSelect && onClientSelect(client);
    } else {
      onChange(client.name);
    }
    setSearch('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(mode === 'id' ? '' : '');
    setSearch('');
  };

  const handleNewClientSaved = async (newClient) => {
    setAddClientOpen(false);
    await queryClient.invalidateQueries({ queryKey: ['clients'] });
    if (newClient?.id) {
      handleSelect(newClient);
    }
  };

  const showDropdown = open && !displayName;

  return (
    <div className="relative" ref={containerRef}>
      {displayName ? (
        <div className="flex items-center gap-2 h-9 px-3 rounded-[4px] border border-input bg-transparent text-sm">
          <span className="flex-1 truncate">{displayName}</span>
          {mode === 'id' && selectedClient?.email && (
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">{selectedClient.email}</span>
          )}
          <button onClick={handleClear} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8"
            placeholder={placeholder}
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        </div>
      )}

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && !search ? (
              <p className="text-sm text-muted-foreground px-3 py-2">Start typing to search clients...</p>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No clients match "{search}".</div>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  onMouseDown={e => { e.preventDefault(); handleSelect(c); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-primary">{c.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    {c.contact_name && <p className="text-xs text-muted-foreground truncate">{c.contact_name}</p>}
                  </div>
                </button>
              ))
            )}
          </div>
          {/* Add client option always visible at bottom */}
          <div className="border-t border-border">
            <button
              onMouseDown={e => { e.preventDefault(); setOpen(false); setAddClientOpen(true); }}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted flex items-center gap-2 font-medium"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              {search ? `Add "${search}" as new client` : 'Add new client'}
            </button>
          </div>
        </div>
      )}

      {addClientOpen && (
        <ClientFormDialog
          client={search ? { name: search } : undefined}
          onClose={handleNewClientSaved}
        />
      )}
    </div>
  );
}