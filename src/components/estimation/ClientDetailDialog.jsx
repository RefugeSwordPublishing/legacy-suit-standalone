import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, MapPin, StickyNote, Pencil, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function ClientDetailDialog({ client, onClose, onEdit, onRefresh }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inviting, setInviting] = useState(false);
  const { toast } = useToast();

  const handleGrantAccess = async () => {
    if (!client.email) {
      toast({ title: 'Client has no email address', variant: 'destructive' });
      return;
    }
    setInviting(true);
    await base44.users.inviteUser(client.email, 'user');
    setInviting(false);
    toast({ title: `Invite sent to ${client.email}`, description: 'They can now log in and access the client portal.' });
  };

  const handleDelete = async () => {
    await base44.entities.Client.delete(client.id);
    onRefresh();
    onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-xl">{client.name}</DialogTitle>
                {client.contact_name && <p className="text-sm text-muted-foreground mt-0.5">{client.contact_name}</p>}
              </div>
              <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>{client.status || 'active'}</Badge>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {client.email && (
              <div className="flex items-center gap-2.5 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${client.email}`} className="text-primary hover:underline">{client.email}</a>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2.5 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{client.phone}</span>
              </div>
            )}
            {(client.billing_address || client.city) && (
              <div className="flex items-start gap-2.5 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  {client.billing_address && <div>{client.billing_address}</div>}
                  {(client.city || client.state || client.zip) && (
                    <div>{[client.city, client.state, client.zip].filter(Boolean).join(', ')}</div>
                  )}
                </div>
              </div>
            )}
            {client.notes && (
              <div className="flex items-start gap-2.5 text-sm bg-muted/40 rounded-lg p-3">
                <StickyNote className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            {client.email && (
              <Button variant="outline" size="sm" className="w-full gap-2 text-primary border-primary/30 hover:bg-primary/5" onClick={handleGrantAccess} disabled={inviting}>
                <UserPlus className="w-4 h-4" />
                {inviting ? 'Sending Invite...' : 'Grant Client Portal Access'}
              </Button>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-4 h-4 mr-1.5" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                <Button size="sm" onClick={onEdit}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{client.name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}