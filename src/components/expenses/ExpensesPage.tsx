'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, Receipt, Pencil, Trash2, Loader2, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

const CATEGORIES = ['materials', 'subcontractor']
const CATEGORY_COLORS: Record<string, string> = {
  materials:     'bg-blue-100 text-blue-700',
  subcontractor: 'bg-amber-100 text-amber-700',
}

function fmt(n: number | null) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const BLANK = { project_id: '', description: '', expense_category: 'materials', total_amount: '' }

export default function ExpensesPage() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [deleting, setDeleting] = useState<any>(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('__all__')

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*').order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, status').order('name')
      return data ?? []
    },
  })

  const filtered = expenses.filter((e: any) => {
    const matchSearch = !search ||
      e.description?.toLowerCase().includes(search.toLowerCase()) ||
      e.project_name?.toLowerCase().includes(search.toLowerCase())
    const matchProject = filterProject === '__all__' || e.project_id === filterProject
    return matchSearch && matchProject
  })

  const totalShown = filtered.reduce((s: number, e: any) => s + (e.total_amount || 0), 0)

  const openNew = () => { setForm(BLANK); setEditing(null); setOpen(true) }
  const openEdit = (e: any) => {
    setForm({ project_id: e.project_id ?? '', description: e.description ?? '', expense_category: e.expense_category ?? 'materials', total_amount: e.total_amount?.toString() ?? '' })
    setEditing(e)
    setOpen(true)
  }

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!form.total_amount) return
    setSaving(true)
    const project = (projects as any[]).find(p => p.id === form.project_id)
    const payload = {
      project_id: form.project_id || null,
      project_name: project?.name || null,
      description: form.description?.trim() || null,
      expense_category: form.expense_category,
      total_amount: parseFloat(form.total_amount),
    }
    if (editing) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', editing.id)
      if (error) { toast.error('Failed to update'); setSaving(false); return }
      toast.success('Expense updated')
    } else {
      const { error } = await supabase.from('expenses').insert(payload)
      if (error) { toast.error('Failed to add expense'); setSaving(false); return }
      toast.success('Expense added')
    }
    setSaving(false)
    setOpen(false)
    qc.invalidateQueries({ queryKey: ['expenses'] })
  }

  const handleDelete = async () => {
    if (!deleting) return
    await supabase.from('expenses').delete().eq('id', deleting.id)
    toast.success('Expense deleted')
    setDeleting(null)
    qc.invalidateQueries({ queryKey: ['expenses'] })
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#3d3d1e]">Expenses</h1>
          <p className="text-sm text-[#7A7560] mt-0.5">Track project expenses</p>
        </div>
        <Button onClick={openNew} className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]" size="sm">
          <Plus className="w-4 h-4 mr-1" /> Add Expense
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-lg px-4 py-3">
          <p className="text-xs text-[#7A7560]">Total Shown</p>
          <p className="text-xl font-bold text-[#3d3d1e]">{fmt(totalShown)}</p>
        </div>
        <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-lg px-4 py-3">
          <p className="text-xs text-[#7A7560]">Count</p>
          <p className="text-xl font-bold text-[#3d3d1e]">{filtered.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <Input placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1" />
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All projects</SelectItem>
            {(projects as any[]).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[#7A7560]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#7A7560]">
          <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No expenses found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((expense: any) => (
            <div key={expense.id} className="flex items-center gap-3 bg-[#F7F4EE] border border-[#D4CFBA] rounded-lg px-4 py-3 group">
              <DollarSign className="w-4 h-4 text-[#7A7560] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm text-[#3d3d1e]">{expense.description || '—'}</p>
                  {expense.expense_category && (
                    <Badge className={`text-[10px] ${CATEGORY_COLORS[expense.expense_category] ?? ''}`}>{expense.expense_category}</Badge>
                  )}
                </div>
                <p className="text-xs text-[#7A7560] mt-0.5">
                  {expense.project_name ?? 'No project'}
                  {expense.created_at ? ` · ${format(new Date(expense.created_at), 'MMM d, yyyy')}` : ''}
                </p>
              </div>
              <p className="font-semibold text-sm text-[#3d3d1e] shrink-0">{fmt(expense.total_amount)}</p>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(expense)} className="p-1.5 rounded hover:bg-[#D4CFBA] text-[#7A7560]"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => setDeleting(expense)} className="p-1.5 rounded hover:bg-red-100 text-[#7A7560] hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={v => !saving && setOpen(v)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Expense' : 'Add Expense'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={form.project_id || '__none__'} onValueChange={v => setForm(f => ({ ...f, project_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project</SelectItem>
                  {(projects as any[]).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What was purchased?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.expense_category} onValueChange={v => setForm(f => ({ ...f, expense_category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount <span className="text-red-500">*</span></Label>
                <Input type="number" min="0" step="0.01" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder="0.00" required />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saving} className="flex-1 bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Save' : 'Add Expense'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
