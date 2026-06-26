'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser, isHighRole } from '@/lib/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, User, Phone, Mail, Pencil, Trash2, Loader2, Building2 } from 'lucide-react'
import { toast } from 'sonner'

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  quickbooks_customer_id: string | null
}

const BLANK: Omit<Client, 'id' | 'quickbooks_customer_id'> = { name: '', email: '', phone: '' }

export default function ClientsPage() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState<Client | null>(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .order('name')
      return (data ?? []) as Client[]
    },
  })

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  const openNew = () => {
    setForm(BLANK)
    setEditing(null)
    setOpen(true)
  }

  const openEdit = (client: Client) => {
    setForm({ name: client.name, email: client.email ?? '', phone: client.phone ?? '' })
    setEditing(client)
    setOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
    }

    if (editing) {
      const { error } = await supabase.from('clients').update(payload).eq('id', editing.id)
      if (error) { toast.error('Failed to update client'); setSaving(false); return }
      toast.success('Client updated')
    } else {
      const { error } = await supabase.from('clients').insert(payload)
      if (error) { toast.error('Failed to create client'); setSaving(false); return }
      toast.success('Client added')
    }

    setSaving(false)
    setOpen(false)
    qc.invalidateQueries({ queryKey: ['clients'] })
  }

  const handleDelete = async () => {
    if (!deleting) return
    const { error } = await supabase.from('clients').delete().eq('id', deleting.id)
    if (error) { toast.error('Failed to delete client'); return }
    toast.success('Client deleted')
    setDeleting(null)
    qc.invalidateQueries({ queryKey: ['clients'] })
  }

  const canManage = isHighRole(currentUser?.role)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#3d3d1e]">Clients</h1>
          <p className="text-sm text-[#7A7560] mt-0.5">{clients.length} total</p>
        </div>
        <Button onClick={openNew} className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]" size="sm">
          <Plus className="w-4 h-4 mr-1" /> Add Client
        </Button>
      </div>

      <Input
        placeholder="Search clients..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-4"
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#7A7560]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#7A7560]">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-3">
            {search ? `No clients found for "${search}"` : 'No clients yet.'}
          </p>
          <Button
            onClick={() => {
              setForm({ name: search || '', email: '', phone: '' })
              setEditing(null)
              setOpen(true)
            }}
            className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            {search ? `Add "${search}" as a client` : 'Add Client'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(client => (
            <div key={client.id} className="flex items-center gap-3 bg-[#F7F4EE] border border-[#D4CFBA] rounded-lg px-4 py-3 group">
              <div className="w-8 h-8 rounded-full bg-[#3d3d1e]/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-[#3d3d1e]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-[#3d3d1e]">{client.name}</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {client.email && (
                    <span className="flex items-center gap-1 text-xs text-[#7A7560]">
                      <Mail className="w-3 h-3" />{client.email}
                    </span>
                  )}
                  {client.phone && (
                    <span className="flex items-center gap-1 text-xs text-[#7A7560]">
                      <Phone className="w-3 h-3" />{client.phone}
                    </span>
                  )}
                </div>
              </div>
              {canManage && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(client)} className="p-1.5 rounded hover:bg-[#D4CFBA] text-[#7A7560] hover:text-[#3d3d1e]">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleting(client)} className="p-1.5 rounded hover:bg-red-100 text-[#7A7560] hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={v => !saving && setOpen(v)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Client' : 'Add Client'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name or business" required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saving} className="flex-1 bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Save Changes' : 'Add Client'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete client?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleting?.name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
