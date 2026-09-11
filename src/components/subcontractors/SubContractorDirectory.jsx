import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Mail, Phone, MapPin, Briefcase, Plus } from 'lucide-react';
import { useState } from 'react';
import SubContractorFormDialog from './SubContractorFormDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ListToolbar from '@/components/shared/ListToolbar';
import { naturalCompare, byDateDesc } from '@/lib/naturalSort';

const SUB_SORT_OPTIONS = [
  { value: 'name', label: 'Name (A to Z)' },
  { value: 'recent', label: 'Recently added' },
];
const subName = (s) => s.business_name || s.contact_name || '';

export default function SubContractorDirectory({ onRefresh }) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['sub-contractors'],
    queryFn: () => base44.entities.SubContractor.list('-created_date'),
  });

  const q = search.trim().toLowerCase();
  const visibleSubs = subs
    .filter(s => !q ||
      subName(s).toLowerCase().includes(q) ||
      (s.contact_name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.contractor_types || [s.contractor_type]).filter(Boolean).join(' ').toLowerCase().includes(q))
    .sort((a, b) => sort === 'recent' ? byDateDesc('created_date')(a, b) : naturalCompare(subName(a), subName(b)));

  const handleDelete = async () => {
    await base44.entities.SubContractor.delete(deleting.id);
    setDeleting(null);
    onRefresh();
  };

  if (isLoading) return <p className="text-center text-muted-foreground py-12 text-sm">Loading...</p>;

  if (subs.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No sub-contractors yet</p>
        <p className="text-sm mt-1">Add contractors to your directory to invite them to bid on projects.</p>
      </div>
    );
  }

  return (
    <>
      <ListToolbar
        className="mb-4"
        search={search}
        onSearch={setSearch}
        placeholder="Search contractors by name, email, or trade..."
        sort={sort}
        onSort={setSort}
        sortOptions={SUB_SORT_OPTIONS}
      />
      {visibleSubs.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">No contractors match your search.</p>
      ) : (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleSubs.map(sub => (
          <div key={sub.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{sub.business_name || sub.contact_name}</p>
                {sub.business_name && sub.contact_name && (
                  <p className="text-xs text-muted-foreground">{sub.contact_name}</p>
                )}
              </div>
              {((sub.contractor_types?.length > 0) || sub.contractor_type) && (
                <div className="flex flex-wrap gap-1">
                  {(sub.contractor_types?.length > 0 ? sub.contractor_types : [sub.contractor_type]).map(t => (
                    <Badge key={t} variant="outline" className="text-xs shrink-0">{t}</Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <a href={`mailto:${sub.email}`} className="hover:text-foreground truncate">{sub.email}</a>
              </div>
              {sub.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span>{sub.phone}</span>
                </div>
              )}
              {sub.billing_address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{sub.billing_address}</span>
                </div>
              )}
            </div>

            {sub.notes && (
              <p className="text-xs text-muted-foreground border-t border-border pt-2">{sub.notes}</p>
            )}

            <div className="flex gap-2 pt-1 border-t border-border">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setEditing(sub)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleting(sub)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      )}

      {editing && (
        <SubContractorFormDialog
          open={!!editing}
          onOpenChange={v => !v && setEditing(null)}
          sub={editing}
          onSaved={() => { setEditing(null); onRefresh(); }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Contractor</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {deleting?.business_name || deleting?.contact_name} from your directory?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}