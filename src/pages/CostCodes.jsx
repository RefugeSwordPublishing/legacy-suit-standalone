import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Hash, Pencil, Trash2 } from 'lucide-react';
import CostCodeFormDialog from '@/components/estimation/CostCodeFormDialog';
import CatalogManager from '@/pages/CatalogManager';
import { useCurrentUser } from '@/lib/UserContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function CostCodes() {
  const qc = useQueryClient();
  // The catalog is a Field feature but has always lived on this Pro page, which left Field
  // tenants with no way to manage it. The page is Field-accessible now; cost codes stay Pro.
  const { currentUser } = useCurrentUser();
  const isPro = currentUser?.is_pro !== false;
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editCode, setEditCode] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: costCodes = [], isLoading } = useQuery({
    queryKey: ['cost-codes'],
    queryFn: () => base44.entities.CostCode.list('code'),
    enabled: isPro,
  });

  const grouped = costCodes
    .filter(c => `${c.code} ${c.name} ${c.category} ${c.description}`.toLowerCase().includes(search.toLowerCase()))
    .reduce((acc, code) => {
      const cat = code.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(code);
      return acc;
    }, {});

  const handleEdit = (code) => {
    setEditCode(code);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    await base44.entities.CostCode.delete(deleteTarget.id);
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ['cost-codes'] });
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditCode(null);
    qc.invalidateQueries({ queryKey: ['cost-codes'] });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-butler text-foreground">{isPro ? 'Cost Codes & Catalog' : 'Catalog'}</h1>
      </div>

      <Tabs defaultValue="catalog">
        <TabsList className="mb-5">
          {isPro && <TabsTrigger value="cost-codes">Cost Codes</TabsTrigger>}
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
        </TabsList>

        <TabsContent value="cost-codes">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">{costCodes.length} codes</p>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Cost Code
            </Button>
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by code, name, or category..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">Loading...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Hash className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No cost codes found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, codes]) => (
                <div key={category}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                    {category}
                  </h2>
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
                      <thead>
                       <tr className="border-b border-border bg-muted/40">
                         <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Code</th>
                         <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                         <th className="w-20"></th>
                       </tr>
                      </thead>
                      <tbody>
                       {codes.map((code) => (
                         <tr key={code.id} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${!code.is_active ? 'opacity-50' : ''}`}>
                           <td className="px-4 py-2.5">
                             <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{code.code}</span>
                           </td>
                           <td className="px-4 py-2.5">
                             <div className="font-medium text-foreground">{code.name}</div>
                             {code.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{code.description}</div>}
                           </td>
                           <td className="px-4 py-2.5">
                             <div className="flex items-center justify-end gap-1">
                               <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(code)}>
                                 <Pencil className="w-3.5 h-3.5" />
                               </Button>
                               <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(code)}>
                                 <Trash2 className="w-3.5 h-3.5" />
                               </Button>
                             </div>
                           </td>
                         </tr>
                       ))}
                      </tbody>
                    </table></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="catalog">
          <CatalogManager />
        </TabsContent>
      </Tabs>

      {formOpen && (
        <CostCodeFormDialog code={editCode} onClose={handleFormClose} />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cost Code?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.code}, {deleteTarget?.name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}