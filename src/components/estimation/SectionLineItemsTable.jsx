import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, BookOpen } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import CatalogPickerDialog from './CatalogPickerDialog';
import { v4 as uuidv4 } from 'uuid';

const CATEGORIES = ['materials', 'labor', 'subcontractor', 'other'];

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function calcLineTotal(item) {
  const base = (item.quantity || 0) * (item.unit_cost || 0);
  return base + base * ((item.markup_pct || 0) / 100);
}

export default function SectionLineItemsTable({ items, onChange, categoryMarkups }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const updateItem = (id, field, value) => {
    onChange(items.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, [field]: value };
      next.line_total = calcLineTotal(next);
      return next;
    }));
  };

  const handleCategoryChange = (id, category) => {
    const defaultMarkup = categoryMarkups?.[category] ?? 0;
    onChange(items.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, category, markup_pct: defaultMarkup };
      next.line_total = calcLineTotal(next);
      return next;
    }));
  };

  const addBlankRow = () => {
    const defaultMarkup = categoryMarkups?.materials ?? 0;
    onChange([...items, {
      id: uuidv4(),
      catalog_item_id: '',
      cost_code_id: '',
      cost_code: '',
      description: '',
      item_description: '',
      category: 'materials',
      quantity: 1,
      unit: '',
      unit_cost: 0,
      markup_pct: defaultMarkup,
      line_total: 0,
    }]);
  };

  const addFromCatalog = (catalogItem) => {
    const defaultMarkup = categoryMarkups?.[catalogItem.category] ?? catalogItem.default_markup ?? 0;
    const qty = catalogItem.default_quantity || 1;
    const unitCost = catalogItem.unit_cost || 0;
    onChange([...items, {
      id: uuidv4(),
      catalog_item_id: catalogItem.id,
      cost_code_id: '',
      cost_code: '',
      description: catalogItem.name,
      item_description: catalogItem.description || '',
      category: catalogItem.category || 'materials',
      quantity: qty,
      unit: catalogItem.unit || '',
      unit_cost: unitCost,
      markup_pct: defaultMarkup,
      line_total: calcLineTotal({ quantity: qty, unit_cost: unitCost, markup_pct: defaultMarkup }),
    }]);
  };

  const removeItem = (id) => onChange(items.filter(i => i.id !== id));

  const sectionSubtotal = items.reduce((s, i) => s + (i.line_total || 0), 0);

  return (
    <div>
      <div className="flex justify-end gap-2 mb-2">
        <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="gap-1.5 text-xs">
          <BookOpen className="w-3.5 h-3.5" />
          From Catalog
        </Button>
        <Button size="sm" variant="outline" onClick={addBlankRow} className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" />
          Add Row
        </Button>
      </div>

      {items.length === 0 ? (
       <p className="text-xs text-muted-foreground py-4 text-center">No items yet, add from catalog or a blank row.</p>
      ) : (
       <div className="space-y-2">
         {/* Desktop table view */}
         <div className="hidden md:block overflow-x-auto">
           <table className="w-full text-sm">
             <thead>
               <tr className="bg-muted/40 text-xs text-muted-foreground">
                 <th className="text-left px-2 py-1.5 font-medium">Description</th>
                 <th className="text-left px-2 py-1.5 font-medium w-28">Category</th>
                 <th className="text-right px-2 py-1.5 font-medium w-16">Qty</th>
                 <th className="text-left px-2 py-1.5 font-medium w-12">Unit</th>
                 <th className="text-right px-2 py-1.5 font-medium w-24">Unit Cost</th>
                 <th className="text-right px-2 py-1.5 font-medium w-24">Labor $/unit</th>
                 <th className="text-right px-2 py-1.5 font-medium w-20">Markup%</th>
                 <th className="text-right px-2 py-1.5 font-medium w-24">Total</th>
                 <th className="w-7"></th>
               </tr>
             </thead>
             <tbody className="divide-y divide-border">
               {items.map(item => (
                 <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                   <td className="px-2 py-1.5">
                     <Input
                       value={item.description}
                       onChange={e => updateItem(item.id, 'description', e.target.value)}
                       className="h-7 text-sm w-full min-w-[140px]"
                       placeholder="Item name"
                     />
                     <Input
                       value={item.item_description || ''}
                       onChange={e => updateItem(item.id, 'item_description', e.target.value)}
                       className="h-6 text-xs w-full min-w-[140px] mt-1 text-muted-foreground"
                       placeholder="Client-facing description (optional)"
                     />
                   </td>
                   <td className="px-2 py-1.5">
                     <Select value={item.category} onValueChange={v => handleCategoryChange(item.id, v)}>
                       <SelectTrigger className="h-7 text-xs w-28">
                         <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                         {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                       </SelectContent>
                     </Select>
                   </td>
                   <td className="px-2 py-1.5">
                     <Input
                       type="number" min="0"
                       value={item.quantity}
                       onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                       className="h-7 text-right w-16"
                     />
                   </td>
                   <td className="px-2 py-1.5">
                     <Input
                       value={item.unit}
                       onChange={e => updateItem(item.id, 'unit', e.target.value)}
                       className="h-7 text-xs w-12"
                       placeholder="ea"
                     />
                   </td>
                   <td className="px-2 py-1.5">
                     <div className="relative w-24">
                       <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                       <Input
                         type="number" min="0"
                         value={item.unit_cost}
                         onChange={e => updateItem(item.id, 'unit_cost', parseFloat(e.target.value) || 0)}
                         className="h-7 text-right pl-4 w-24"
                       />
                     </div>
                   </td>
                   <td className="px-2 py-1.5">
                     {item.category === 'materials' ? (
                       <div className="relative w-24">
                         <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                         <Input
                           type="number" min="0"
                           value={item.labor_cost_per_unit ?? 0}
                           onChange={e => updateItem(item.id, 'labor_cost_per_unit', parseFloat(e.target.value) || 0)}
                           className="h-7 text-right pl-4 w-24"
                           placeholder="0.00"
                         />
                       </div>
                     ) : item.category === 'labor' ? (
                       <div className="flex items-center gap-1.5 px-1">
                         <Switch
                           checked={item.labor_auto !== false}
                           onCheckedChange={val => updateItem(item.id, 'labor_auto', val)}
                           className="scale-75 origin-left"
                         />
                         <span className="text-[10px] text-muted-foreground">{item.labor_auto !== false ? 'Auto' : 'Manual'}</span>
                       </div>
                     ) : (
                       <span className="text-xs text-muted-foreground px-2">, </span>
                     )}
                   </td>
                   <td className="px-2 py-1.5">
                     <div className="relative w-20">
                       <Input
                         type="number" min="0" max="200"
                         value={item.markup_pct}
                         onChange={e => updateItem(item.id, 'markup_pct', parseFloat(e.target.value) || 0)}
                         className="h-7 text-right pr-5 w-20"
                       />
                       <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                     </div>
                   </td>
                   <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap text-sm">
                     ${fmt(item.line_total)}
                   </td>
                   <td className="px-1 py-1.5">
                     <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                       <Trash2 className="w-3.5 h-3.5" />
                     </button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
           <div className="flex justify-end pr-7 pt-2 border-t border-border mt-1">
             <span className="text-xs text-muted-foreground mr-3">Section Subtotal</span>
             <span className="text-sm font-bold">${fmt(sectionSubtotal)}</span>
           </div>
         </div>

         {/* Mobile card view */}
         <div className="md:hidden space-y-2">
           {items.map(item => (
             <div key={item.id} className="bg-muted/20 rounded-md p-2 space-y-1.5 border border-border text-xs">
               <div className="flex justify-between items-start gap-2">
                 <div className="flex-1 space-y-1">
                   <Input
                     value={item.description}
                     onChange={e => updateItem(item.id, 'description', e.target.value)}
                     className="h-6 text-xs w-full"
                     placeholder="Item name"
                   />
                   <Input
                     value={item.item_description || ''}
                     onChange={e => updateItem(item.id, 'item_description', e.target.value)}
                     className="h-6 text-xs w-full text-muted-foreground"
                     placeholder="Client-facing description (optional)"
                   />
                 </div>
                 <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                   <Trash2 className="w-3.5 h-3.5" />
                 </button>
               </div>

               <div className="grid grid-cols-3 gap-1.5">
                 <div>
                   <label className="text-xs text-muted-foreground block mb-0.5">Category</label>
                   <Select value={item.category} onValueChange={v => handleCategoryChange(item.id, v)}>
                     <SelectTrigger className="h-6 text-xs w-full">
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize text-xs">{c}</SelectItem>)}
                     </SelectContent>
                   </Select>
                 </div>
                 <div>
                   <label className="text-xs text-muted-foreground block mb-0.5">Qty</label>
                   <Input
                     type="number" min="0"
                     value={item.quantity}
                     onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                     className="h-6 text-right text-xs w-full"
                   />
                 </div>
                 <div>
                   <label className="text-xs text-muted-foreground block mb-0.5">Unit</label>
                   <Input
                     value={item.unit}
                     onChange={e => updateItem(item.id, 'unit', e.target.value)}
                     className="h-6 text-xs w-full"
                     placeholder="ea"
                   />
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-1.5">
                 <div>
                   <label className="text-xs text-muted-foreground block mb-0.5">Unit Cost</label>
                   <div className="relative">
                     <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                     <Input
                       type="number" min="0"
                       value={item.unit_cost}
                       onChange={e => updateItem(item.id, 'unit_cost', parseFloat(e.target.value) || 0)}
                       className="h-6 text-right pl-3.5 text-xs w-full"
                     />
                   </div>
                 </div>
                 <div>
                   <label className="text-xs text-muted-foreground block mb-0.5">Markup%</label>
                   <div className="relative">
                     <Input
                       type="number" min="0" max="200"
                       value={item.markup_pct}
                       onChange={e => updateItem(item.id, 'markup_pct', parseFloat(e.target.value) || 0)}
                       className="h-6 text-right pr-5 text-xs w-full"
                     />
                     <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                   </div>
                 </div>
               </div>

               {item.category === 'materials' && (
                 <div>
                   <label className="text-xs text-muted-foreground block mb-0.5">Labor $/unit</label>
                   <div className="relative">
                     <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                     <Input
                       type="number" min="0"
                       value={item.labor_cost_per_unit ?? 0}
                       onChange={e => updateItem(item.id, 'labor_cost_per_unit', parseFloat(e.target.value) || 0)}
                       className="h-6 text-right pl-3.5 text-xs w-full"
                       placeholder="0.00"
                     />
                   </div>
                 </div>
               )}
               {item.category === 'labor' && (
                 <div className="flex items-center gap-2">
                   <Switch
                     checked={item.labor_auto !== false}
                     onCheckedChange={val => updateItem(item.id, 'labor_auto', val)}
                     className="scale-75 origin-left"
                   />
                   <span className="text-xs text-muted-foreground">{item.labor_auto !== false ? 'Auto-calculated' : 'Manual'}</span>
                 </div>
               )}

               <div className="flex justify-between items-center pt-1 border-t border-border">
                 <span className="text-muted-foreground">Total</span>
                 <span className="font-semibold">${fmt(item.line_total)}</span>
               </div>
             </div>
           ))}
           <div className="flex justify-end pt-2 border-t border-border mt-3">
             <div className="text-right text-xs">
               <span className="text-muted-foreground block">Section Subtotal</span>
               <span className="text-sm font-bold">${fmt(sectionSubtotal)}</span>
             </div>
           </div>
         </div>
       </div>
      )}

      <CatalogPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={addFromCatalog} />
    </div>
  );
}