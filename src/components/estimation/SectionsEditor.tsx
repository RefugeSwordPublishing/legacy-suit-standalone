'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import SectionLineItemsTable from './SectionLineItemsTable'

const DEFAULT_MARKUPS = { materials: 20, labor: 15, subcontractor: 10, other: 0 }

function fmt(n: number) {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  sections: any[]
  onChange: (sections: any[]) => void
  categoryMarkups?: Record<string, number>
}

export default function SectionsEditor({ sections, onChange, categoryMarkups = DEFAULT_MARKUPS }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleCollapse = (id: string) => setCollapsed(c => ({ ...c, [id]: !c[id] }))

  const addSection = () => {
    onChange([...sections, { id: uuidv4(), name: 'New Section', line_items: [] }])
  }

  const updateSectionName = (id: string, name: string) => {
    onChange(sections.map(s => s.id === id ? { ...s, name } : s))
  }

  const updateSectionItems = (id: string, items: any[]) => {
    onChange(sections.map(s => s.id === id ? { ...s, line_items: items } : s))
  }

  const removeSection = (id: string) => {
    onChange(sections.filter(s => s.id !== id))
  }

  return (
    <div className="space-y-3">
      {sections.length === 0 && (
        <div className="text-center py-10 text-[#7A7560] text-sm border border-dashed border-[#D4CFBA] rounded-lg">
          No sections yet. Add a section to start building your estimate.
        </div>
      )}

      {sections.map(section => {
        const isCollapsed = collapsed[section.id]
        const sectionTotal = (section.line_items || []).reduce((s: number, i: any) => s + (i.line_total || 0), 0)

        return (
          <div key={section.id} className="bg-card border border-[#D4CFBA] rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-[#D4CFBA]">
              <button onClick={() => toggleCollapse(section.id)} className="text-[#7A7560] hover:text-[#3d3d1e]">
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <Input
                value={section.name}
                onChange={e => updateSectionName(section.id, e.target.value)}
                className="flex-1 h-7 font-semibold text-sm border-0 shadow-none px-1 bg-transparent focus-visible:ring-0"
                placeholder="Section name..."
              />
              <span className="text-sm font-bold text-[#3d3d1e] shrink-0 mr-2">${fmt(sectionTotal)}</span>
              <button onClick={() => removeSection(section.id)} className="text-[#7A7560] hover:text-red-600 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {!isCollapsed && (
              <div className="p-4">
                <SectionLineItemsTable
                  items={section.line_items || []}
                  onChange={items => updateSectionItems(section.id, items)}
                  categoryMarkups={categoryMarkups}
                />
              </div>
            )}
          </div>
        )
      })}

      <Button variant="outline" onClick={addSection} className="w-full gap-2 border-dashed border-[#D4CFBA]">
        <Plus className="w-4 h-4" /> Add Section
      </Button>
    </div>
  )
}
