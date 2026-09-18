import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Building2, Phone, Mail, MapPin } from 'lucide-react';
import ClientFormDialog from '@/components/estimation/ClientFormDialog';
import ClientDetailDialog from '@/components/estimation/ClientDetailDialog';
import ListToolbar from '@/components/shared/ListToolbar';
import { naturalCompare, byDateDesc } from '@/lib/naturalSort';

const CLIENT_SORT_OPTIONS = [
  { value: 'name', label: 'Name (A to Z)' },
  { value: 'recent', label: 'Recently added' },
];

export default function Clients() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [formOpen, setFormOpen] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [viewClient, setViewClient] = useState(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date'),
  });

  const filtered = clients
    .filter(c => `${c.name} ${c.contact_name} ${c.email} ${c.phone}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === 'recent' ? byDateDesc('created_date')(a, b) : naturalCompare(a.name, b.name));

  const handleEdit = (client) => {
    setEditClient(client);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditClient(null);
    qc.invalidateQueries({ queryKey: ['clients'] });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-butler text-foreground">Client Directory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{clients.length} clients</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Client
        </Button>
      </div>

      <ListToolbar
        className="mb-4"
        search={search}
        onSearch={setSearch}
        placeholder="Search clients by name, contact, email, or phone..."
        sort={sort}
        onSort={setSort}
        sortOptions={CLIENT_SORT_OPTIONS}
      />

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No clients found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(client => (
            <div
              key={client.id}
              className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setViewClient(client)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground">{client.name}</h3>
                  {client.contact_name && (
                    <p className="text-sm text-muted-foreground">{client.contact_name}</p>
                  )}
                </div>
                <Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="text-xs shrink-0">
                  {client.status || 'active'}
                </Badge>
              </div>
              <div className="space-y-1.5">
                {client.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {(client.city || client.state) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{[client.city, client.state].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <ClientFormDialog
          client={editClient}
          onClose={handleFormClose}
        />
      )}

      {viewClient && (
        <ClientDetailDialog
          client={viewClient}
          onClose={() => setViewClient(null)}
          onEdit={() => { setViewClient(null); handleEdit(viewClient); }}
          onRefresh={() => qc.invalidateQueries({ queryKey: ['clients'] })}
        />
      )}
    </div>
  );
}