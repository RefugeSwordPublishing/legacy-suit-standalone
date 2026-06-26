'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser, isHighRole } from '@/lib/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, Pencil, Trash2, Loader2, Tag } from 'lucide-react'
import { toast } from 'sonner'

interface CostCode {
  id: string
  name: string
  category: string | null
  code: string | null
  description: string | null
  is_active: boolean
  quickbooks_item_id: string | null
  quickbooks_item_name: string | null
  quickbooks_income_account_id: string | null
  quickbooks_income_account_name: string | null
}

const CATEGORIES = ['labor', 'materials', 'subcontractor', 'other']

const CATEGORY_COLORS: Record<string, string> = {
  labor:         'bg-green-100 text-green-700',
  materials:     'bg-blue-100 text-blue-700',
  subcontractor: 'bg-amber-100 text-amber-700',
  other:         'bg-slate-100 text-slate-600',
}

const BLANK = { name: '', category: 'materials', code: '', description: '' }

export default function CostCodesPage() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CostCode | null>(null)
  const [deleting, setDeleting] = useState<CostCode | null>(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')

  const { data: costCodes = [], isLoading } = useQuery({
    queryKey: ['cost-codes'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cost_codes')
        .select('*')
        .order('category')
        .order('name')
      return (data ?? []) as CostCode[]
    },
  })

  const filtered = costCodes.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code?.toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'all' || c.category === catFilter
    return matchSearch && matchCat
  })

  const openNew = () => {
    setForm(BLANK)
    setEditing(null)
    setOpen(true)
  }

  const openEdit = (cc: CostCode) => {
    setForm({ name: cc.name, category: cc.category ?? 'materials', code: cc.code ?? '', description: cc.description ?? '' })
    setEditing(cc)
    setOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      category: form.category,
      code: form.code?.trim() || null,
      description: form.description?.trim() || null,
    }

    if (editing) {
      const { error } = await supabase.from('cost_codes').update(payload).eq('id', editing.id)
      if (error) { toast.error('Failed to update cost code'); setSaving(false); return }
      toast.success('Cost code updated')
    } else {
      const { error } = await supabase.from('cost_codes').insert({ ...payload, is_active: true })
      if (error) { toast.error('Failed to create cost code'); setSaving(false); return }
      toast.success('Cost code added')
    }

    setSaving(false)
    setOpen(false)
    qc.invalidateQueries({ queryKey: ['cost-codes'] })
  }

  const handleDelete = async () => {
    if (!deleting) return
    const { error } = await supabase.from('cost_codes').delete().eq('id', deleting.id)
    if (error) { toast.error('Failed to delete cost code'); return }
    toast.success('Cost code deleted')
    setDeleting(null)
    qc.invalidateQueries({ queryKey: ['cost-codes'] })
  }

  const canManage = isHighRole(currentUser?.role)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#3d3d1e]">Cost Codes</h1>
          <p className="text-sm text-[#7A7560] mt-0.5">{costCodes.length} total</p>
        </div>
        {canManage && (
          <Button onClick={openNew} className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add Cost Code
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search cost codes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#7A7560]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#7A7560]">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? 'No cost codes match your search.' : 'No cost codes yet.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(cc => (
            <div key={cc.id} className="flex items-center gap-3 bg-[#F7F4EE] border border-[#D4CFBA] rounded-lg px-4 py-3 group">
              {cc.code && (
                <span className="font-mono text-xs text-[#7A7560] bg-[#D4CFBA]/50 px-2 py-0.5 rounded shrink-0">
                  {cc.code}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-[#3d3d1e]">{cc.name}</p>
                {cc.description && <p className="text-xs text-[#7A7560] truncate mt-0.5">{cc.description}</p>}
                {cc.quickbooks_item_name && (
                  <p className="text-xs text-[#7A7560] mt-0.5">QBO: {cc.quickbooks_item_name}</p>
                )}
              </div>
              {cc.category && (
                <Badge className={`text-xs capitalize shrink-0 ${CATEGORY_COLORS[cc.category] ?? ''}`}>
                  {cc.category}
                </Badge>
              )}
              {canManage && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(cc)} className="p-1.5 rounded hover:bg-[#D4CFBA] text-[#7A7560] hover:text-[#3d3d1e]">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleting(cc)} className="p-1.5 rounded hover:bg-red-100 text-[#7A7560] hover:text-red-600">
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
            <DialogTitle>{editing ? 'Edit Cost Code' : 'Add Cost Code'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Framing Labor" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. L-01" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saving} className="flex-1 bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Save Changes' : 'Add Cost Code'}
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
            <AlertDialogTitle>Delete cost code?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleting?.name}</strong>. Any estimates using this code will lose the reference.
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
