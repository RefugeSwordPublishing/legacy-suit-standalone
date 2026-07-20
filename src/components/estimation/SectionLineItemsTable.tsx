'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trash2, Plus, BookOpen, Search, SlidersHorizontal } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'

const CATEGORIES = ['materials', 'labor', 'subcontractor', 'other']

const CATEGORY_COLORS: Record<string, string> = {
  materials:     'bg-blue-100 text-blue-700',
  labor:         'bg-green-100 text-green-700',
  subcontractor: 'bg-amber-100 text-amber-700',
  other:         'bg-slate-100 text-slate-600',
}

function fmt(n: number) {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcLineTotal(item: any) {
  const unitCost = item.unit_cost || 0
  const laborCost = item.labor_cost || 0
  const qty = item.quantity || 0
  const base = qty * (unitCost + laborCost)
  return base + base * ((item.markup_pct || 0) / 100)
}

export interface ColumnSettings {
  show_qty: boolean
  show_unit: boolean
  show_line_total: boolean
}

interface Props {
  items: any[]
  onChange: (items: any[]) => void
  categoryMarkups: Record<string, number>
  columnSettings?: ColumnSettings
  onColumnSettingsChange?: (s: ColumnSettings) => void
}

function CatalogPicker({ onSelect, onClose }: { onSelect: (item: any) => void; onClose: () => void }) {
  const supabase = createClient()
  const [search, setSearch] = useState('')

  const { data: catalogItems = [] } = useQuery({
    queryKey: ['catalog-items'],
    queryFn: async () => {
      const { data } = await supabase.from('catalog_items').select('*').eq('is_active', true).order('name')
      return data ?? []
    },
  })

  const filtered = (catalogItems as any[]).filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.category?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> Catalog</DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#7A7560]" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search catalog..." className="pl-8" />
        </div>
        <div className="overflow-y-auto flex-1 space-y-1">
          {filtered.length === 0 && <p className="text-sm text-[#7A7560] text-center py-8">No items found.</p>}
          {filtered.map((item: any) => (
            <button
              key={item.id}
              onClick={() => { onSelect(item); onClose() }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#D4CFBA]/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#3d3d1e] truncate">{item.name}</p>
                  {item.description && <p className="text-xs text-[#7A7560] truncate">{item.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.category && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${CATEGORY_COLORS[item.category] ?? ''}`}>{item.category}</span>
                  )}
                  <span className="text-sm font-semibold text-[#3d3d1e]">${fmt(item.unit_cost)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const DEFAULT_COL_SETTINGS: ColumnSettings = { show_qty: true, show_unit: true, show_line_total: true }

export default function SectionLineItemsTable({ items, onChange, categoryMarkups, columnSettings, onColumnSettingsChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [colMenuOpen, setColMenuOpen] = useState(false)

  const cols = columnSettings ?? DEFAULT_COL_SETTINGS

  const toggleCol = (key: keyof ColumnSettings) => {
    if (!onColumnSettingsChange) return
    onColumnSettingsChange({ ...cols, [key]: !cols[key] })
  }

  const updateItem = (id: string, field: string, value: any) => {
    onChange(items.map(item => {
      if (item.id !== id) return item
      const next = { ...item, [field]: value }
      next.line_total = calcLineTotal(next)
      return next
    }))
  }

  const handleCategoryChange = (id: string, category: string) => {
    const defaultMarkup = categoryMarkups?.[category] ?? 0
    onChange(items.map(item => {
      if (item.id !== id) return item
      const next = { ...item, category, markup_pct: defaultMarkup }
      next.line_total = calcLineTotal(next)
      return next
    }))
  }

  const addBlankRow = () => {
    const defaultMarkup = categoryMarkups?.materials ?? 0
    onChange([...items, {
      id: uuidv4(),
      description: '',
      category: 'materials',
      quantity: 1,
      unit: '',
      unit_cost: 0,
      labor_cost: 0,
      markup_pct: defaultMarkup,
      line_total: 0,
    }])
  }

  const addFromCatalog = (catalogItem: any) => {
    const defaultMarkup = categoryMarkups?.[catalogItem.category] ?? catalogItem.default_markup ?? 0
    const qty = catalogItem.default_quantity || 1
    const unitCost = catalogItem.unit_cost || 0
    const laborCost = catalogItem.labor_cost || 0
    onChange([...items, {
      id: uuidv4(),
      catalog_item_id: catalogItem.id,
      description: catalogItem.name,
      category: catalogItem.category || 'materials',
      quantity: qty,
      unit: catalogItem.unit || '',
      unit_cost: unitCost,
      labor_cost: laborCost,
      markup_pct: defaultMarkup,
      line_total: calcLineTotal({ quantity: qty, unit_cost: unitCost, labor_cost: laborCost, markup_pct: defaultMarkup }),
    }])
  }

  const removeItem = (id: string) => onChange(items.filter(i => i.id !== id))

  return (
    <div>
      <div className="flex justify-end gap-2 mb-2">
        {onColumnSettingsChange && (
          <div className="relative">
            <Button size="sm" variant="outline" onClick={() => setColMenuOpen(o => !o)} className="gap-1.5 text-xs">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Columns
            </Button>
            {colMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#D4CFBA] rounded-lg shadow-lg p-3 space-y-2 z-20 w-40">
                {([['show_qty', 'Qty'], ['show_unit', 'Unit'], ['show_line_total', 'Line Total']] as [keyof ColumnSettings, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-xs text-[#3d3d1e]">
                    <input
                      type="checkbox"
                      checked={cols[key]}
                      onChange={() => toggleCol(key)}
                      className="rounded"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="gap-1.5 text-xs">
          <BookOpen className="w-3.5 h-3.5" /> From Catalog
        </Button>
        <Button size="sm" variant="outline" onClick={addBlankRow} className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> Add Row
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-[#7A7560] py-4 text-center">No items yet — add from catalog or a blank row.</p>
      ) : (
        <div className="space-y-2">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-xs text-[#7A7560]">
                  <th className="text-left px-2 py-1.5 font-medium">Description</th>
                  <th className="text-left px-2 py-1.5 font-medium w-32">Category</th>
                  {cols.show_qty && <th className="text-right px-2 py-1.5 font-medium w-16">Qty</th>}
                  {cols.show_unit && <th className="text-left px-2 py-1.5 font-medium w-12">Unit</th>}
                  <th className="text-right px-2 py-1.5 font-medium w-24">Unit Cost</th>
                  <th className="text-right px-2 py-1.5 font-medium w-24">Labor $/Unit</th>
                  <th className="text-right px-2 py-1.5 font-medium w-20">Markup%</th>
                  {cols.show_line_total && <th className="text-right px-2 py-1.5 font-medium w-24">Total</th>}
                  <th className="w-7"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="px-2 py-1.5">
                      <Input
                        value={item.description || ''}
                        onChange={e => updateItem(item.id, 'description', e.target.value)}
                        placeholder="Description..."
                        className="h-7 text-xs border-0 shadow-none px-0 focus-visible:ring-0"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={item.category || 'materials'} onValueChange={v => handleCategoryChange(item.id, v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs capitalize">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    {cols.show_qty && (
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" min="0" step="0.01"
                          value={item.quantity || ''}
                          onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs text-right border-0 shadow-none px-0 focus-visible:ring-0"
                        />
                      </td>
                    )}
                    {cols.show_unit && (
                      <td className="px-2 py-1.5">
                        <Input
                          value={item.unit || ''}
                          onChange={e => updateItem(item.id, 'unit', e.target.value)}
                          placeholder="ea"
                          className="h-7 text-xs border-0 shadow-none px-0 focus-visible:ring-0"
                        />
                      </td>
                    )}
                    <td className="px-2 py-1.5">
                      <Input
                        type="number" min="0" step="0.01"
                        value={item.unit_cost || ''}
                        onChange={e => updateItem(item.id, 'unit_cost', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right border-0 shadow-none px-0 focus-visible:ring-0"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number" min="0" step="0.01"
                        value={item.labor_cost || ''}
                        onChange={e => updateItem(item.id, 'labor_cost', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right border-0 shadow-none px-0 focus-visible:ring-0"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number" min="0" step="0.1"
                        value={item.markup_pct || ''}
                        onChange={e => updateItem(item.id, 'markup_pct', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right border-0 shadow-none px-0 focus-visible:ring-0"
                      />
                    </td>
                    {cols.show_line_total && (
                      <td className="px-2 py-1.5 text-right font-medium text-xs">${fmt(item.line_total || 0)}</td>
                    )}
                    <td className="px-1 py-1.5">
                      <button onClick={() => removeItem(item.id)} className="text-[#7A7560] hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {items.map(item => (
              <div key={item.id} className="border border-[#D4CFBA] rounded-lg p-3 space-y-2">
                <Input
                  value={item.description || ''}
                  onChange={e => updateItem(item.id, 'description', e.target.value)}
                  placeholder="Description..."
                  className="h-8 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={item.category || 'materials'} onValueChange={v => handleCategoryChange(item.id, v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {cols.show_qty && (
                    <Input
                      type="number" min="0" step="0.01"
                      value={item.quantity || ''}
                      onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      placeholder="Qty"
                      className="h-8 text-xs"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" min="0" step="0.01" value={item.unit_cost || ''} onChange={e => updateItem(item.id, 'unit_cost', parseFloat(e.target.value) || 0)} placeholder="Unit $" className="h-8 text-xs" />
                  <Input type="number" min="0" step="0.01" value={item.labor_cost || ''} onChange={e => updateItem(item.id, 'labor_cost', parseFloat(e.target.value) || 0)} placeholder="Labor $/unit" className="h-8 text-xs" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Input type="number" min="0" step="0.1" value={item.markup_pct || ''} onChange={e => updateItem(item.id, 'markup_pct', parseFloat(e.target.value) || 0)} placeholder="Markup%" className="h-8 text-xs flex-1" />
                  {cols.show_line_total && <span className="text-xs font-semibold">${fmt(item.line_total || 0)}</span>}
                  <button onClick={() => removeItem(item.id)} className="text-[#7A7560] hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pickerOpen && <CatalogPicker onSelect={addFromCatalog} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}
