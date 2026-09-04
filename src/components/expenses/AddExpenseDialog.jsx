import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Plus, Trash2, Sparkles, Camera } from 'lucide-react';
import SignedImage from '@/components/shared/SignedImage';
import CameraCapture from '@/components/shared/CameraCapture';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';
import DuplicateExpenseWarningDialog from './DuplicateExpenseWarningDialog';
import { sortByName } from '@/lib/naturalSort';
import { logError } from '@/lib/errorLog';

const EMPTY_FORM = {
  project_id: '',
  project_name: '',
  receipt_image: '',
  expense_category: 'materials',
  cost_code_id: '',
  cost_code: '',
  vendor: '',
  date: '',
  total_amount: '',
  billable: true,
  notes: '',
  line_items: [],
};

// expense prop = existing record for edit mode
export default function AddExpenseDialog({ open, onOpenChange, projects, onSaved, expense, onDeleted }) {
  const { toast } = useToast();
  const isEditMode = !!expense;
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [dupWarning, setDupWarning] = useState(null); // { existingExpense, pendingPayload }

  // Populate form when editing
  useEffect(() => {
    if (open && expense) {
      setForm({
        project_id: expense.project_id || '',
        project_name: expense.project_name || '',
        receipt_image: expense.receipt_image || '',
        expense_category: expense.expense_category || 'materials',
        cost_code_id: expense.cost_code_id || '',
        cost_code: expense.cost_code || '',
        vendor: expense.vendor || '',
        date: expense.date || '',
        total_amount: expense.total_amount != null ? String(expense.total_amount) : '',
        billable: expense.billable !== false,
        notes: expense.notes || '',
        line_items: (expense.line_items || []).map(li => ({ id: li.id || uuidv4(), description: li.description || '', amount: li.amount || 0 })),
      });
    } else if (open && !expense) {
      setForm(EMPTY_FORM);
    }
  }, [open, expense]);

  const { data: costCodes = [] } = useQuery({
    queryKey: ['cost-codes-active'],
    queryFn: () => base44.entities.CostCode.filter({ is_active: true }, 'code', 200),
  });

  const { data: expenseCats = [] } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => base44.entities.ExpenseCategory.filter({ is_active: true }, 'sort_order', 100),
  });

  // Default a new expense to the first real category (instead of the legacy 'materials' slug).
  useEffect(() => {
    if (open && !isEditMode && expenseCats.length && !expenseCats.some(c => c.name === form.expense_category)) {
      setForm(f => ({ ...f, expense_category: expenseCats[0].name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditMode, expenseCats]);

  const { data: allExpenses = [] } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => base44.entities.Expense.list('-created_date', 200),
    enabled: open,
  });

  const extractFromFile = async (uploadedUrl) => {
    // Images and PDFs both go straight to the LLM; invoke-llm reads a PDF natively as a document,
    // so there's no fragile client-side (CDN pdf.js) rasterization to fail in the field.
    const fileUrls = [uploadedUrl];
    const prompt = `You are extracting data from a purchase receipt (a photo or a PDF). Read it carefully and return ONLY valid JSON with these keys:
- vendor: the store/merchant name (string)
- date: the purchase date in YYYY-MM-DD format (empty string if unclear)
- total_amount: the final total actually charged (number)
- line_items: an array of the PURCHASED product/service lines only, each { "description": string, "amount": number }

Rules for line_items:
- Include ONLY actual purchased items and their price.
- DO NOT include subtotal, tax/sales tax, total, balance due, change, tender, cash, card, account, or discount rows. Those are summary/payment rows, not line items.
- Use the item's line price as "amount"; if quantity x unit price is shown, use the extended line price.
- Ignore SKU/UPC/item numbers; keep the human-readable product description exactly as printed.
- The sum of line_items plus tax should be close to total_amount; if a row would make it exceed the total, it is probably a summary row, not an item.

Return only the JSON object. No markdown, no commentary.`;

    return base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: fileUrls,
      response_json_schema: {
        type: 'object',
        properties: {
          vendor: { type: 'string' },
          date: { type: 'string' },
          line_items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                amount: { type: 'number' }
              }
            }
          },
          total_amount: { type: 'number' }
        }
      }
    });
  };

  const handleFileUpload = async (e) => {
    let file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // HEIC (default on many phones) isn't supported by the vision API or browsers; convert to JPEG.
      if (file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name || '')) {
        const heic2any = (await import('heic2any')).default;
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
        const out = Array.isArray(converted) ? converted[0] : converted;
        file = new File([out], (file.name || 'receipt').replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' });
      }
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, receipt_image: file_url }));
      setExtracting(true);
      const result = await extractFromFile(file_url);
      const extracted = (typeof result === 'string' ? JSON.parse(result) : result) || {};
      const gotSomething = extracted.vendor || extracted.total_amount || extracted.line_items?.length;
      setForm(f => ({
        ...f,
        vendor: extracted.vendor || f.vendor,
        date: extracted.date || f.date,
        total_amount: extracted.total_amount || f.total_amount,
        line_items: (extracted.line_items || []).map(li => ({ id: uuidv4(), description: li.description, amount: li.amount || 0 })),
      }));
      if (gotSomething) {
        toast({ title: 'Receipt scanned!', description: 'Review and edit the extracted details.' });
      } else {
        // Model read the image but found nothing usable (blurry, cropped, glare, or not a receipt).
        toast({
          title: 'Could not read that receipt',
          description: 'The photo may be blurry, cropped, or too dark. Enter the details manually, or retake it flat and well lit.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      logError('receipt_extract', err, { file_name: file?.name, file_type: file?.type, file_size: file?.size });
      toast({
        title: 'Could not extract receipt data',
        description: err?.message ? String(err.message).slice(0, 160) : 'You can fill in the details manually.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  const handleProjectChange = (pid) => {
    const project = projects.find(p => p.id === pid);
    setForm(f => ({ ...f, project_id: pid, project_name: project?.name || '' }));
  };

  const updateLineItem = (id, field, value) => {
    setForm(f => ({ ...f, line_items: f.line_items.map(li => li.id === id ? { ...li, [field]: value } : li) }));
  };

  const addLineItem = () => {
    setForm(f => ({ ...f, line_items: [...f.line_items, { id: uuidv4(), description: '', amount: 0 }] }));
  };

  const removeLineItem = (id) => {
    setForm(f => ({ ...f, line_items: f.line_items.filter(li => li.id !== id) }));
  };

  const handleCostCodeChange = (ccId) => {
    const cc = costCodes.find(c => c.id === ccId);
    setForm(f => ({ ...f, cost_code_id: ccId, cost_code: cc ? `${cc.code} - ${cc.name}` : '' }));
  };

  const buildPayload = () => ({
    project_id: form.project_id,
    project_name: form.project_name,
    receipt_image: form.receipt_image || undefined,
    expense_category: form.expense_category,
    cost_code_id: form.cost_code_id || undefined,
    cost_code: form.cost_code || undefined,
    vendor: form.vendor,
    date: form.date,
    total_amount: parseFloat(form.total_amount) || 0,
    billable: form.billable,
    notes: form.notes,
    line_items: form.line_items,
  });

  const commitSave = async (payload) => {
    setSaving(true);
    try {
      let saved;
      if (isEditMode) {
        saved = await base44.entities.Expense.update(expense.id, payload);
      } else {
        saved = await base44.entities.Expense.create(payload);
      }
      toast({ title: isEditMode ? 'Expense updated!' : 'Expense saved!' });
      onSaved?.(saved);
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.project_id) { toast({ title: 'Please select a project', variant: 'destructive' }); return; }
    const payload = buildPayload();

    // Duplicate check (only for new expenses)
    if (!isEditMode) {
      const newTotal = payload.total_amount;
      const match = allExpenses.find(e => Math.abs((e.total_amount || 0) - newTotal) < 0.005 && newTotal > 0);
      if (match) {
        setDupWarning({ existingExpense: match, pendingPayload: payload });
        return;
      }
    }

    await commitSave(payload);
  };

  const handleDelete = async () => {
    if (!expense) return;
    setDeleting(true);
    try {
      await base44.entities.Expense.delete(expense.id);
      toast({ title: 'Expense deleted.' });
      onDeleted?.();
      handleClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setDupWarning(null);
    onOpenChange(false);
  };

  const [isDragOver, setIsDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleFileUpload({ target: { files: [file] } });
  };

  const isLoading = uploading || extracting;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Receipt Upload */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Receipt Photo</label>
              {form.receipt_image ? (
                <div className="relative rounded-md overflow-hidden border border-border">
                  <SignedImage src={form.receipt_image} alt="Receipt" className="w-full max-h-40 object-contain bg-muted/30" />
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    {extracting && (
                      <div className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-md">
                        <Sparkles className="w-3 h-3 animate-pulse" />
                        Extracting...
                      </div>
                    )}
                    <label className="cursor-pointer bg-background/90 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted transition-colors">
                      Change
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label
                    className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isLoading ? 'opacity-50 pointer-events-none' : isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/20'}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                  >
                    {uploading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : <Upload className="w-6 h-6 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground">{uploading ? 'Uploading...' : isDragOver ? 'Drop file here' : 'Click or drag & drop receipt / PDF'}</span>
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
                  </label>
                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    disabled={isLoading}
                    className={`flex items-center justify-center gap-2 py-2 px-4 w-full border border-primary text-primary rounded-md text-sm font-medium transition-colors hover:bg-muted ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <Camera className="w-4 h-4" />
                    Take Photo
                  </button>
                </div>
              )}
            </div>

            {/* Project */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Project <span className="text-destructive">*</span></label>
              <Select value={form.project_id} onValueChange={handleProjectChange}>
                <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                <SelectContent>
                  {sortByName(projects).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Category & Cost Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Category <span className="text-destructive">*</span></label>
                <Select value={form.expense_category} onValueChange={v => setForm(f => ({ ...f, expense_category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {expenseCats.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    {form.expense_category && !expenseCats.some(c => c.name === form.expense_category) && (
                      <SelectItem value={form.expense_category}>{form.expense_category}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Cost Code</label>
                <Select value={form.cost_code_id} onValueChange={handleCostCodeChange}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {costCodes.map(cc => (
                      <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Vendor & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Vendor</label>
                <Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Store name..." />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Date</label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>

            {/* Total Amount */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Total Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input type="number" min="0" step="0.01" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} className="pl-6" placeholder="0.00" />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-muted-foreground">Line Items</label>
                <Button size="sm" variant="ghost" onClick={addLineItem} className="h-6 text-xs gap-1 px-2">
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
              {form.line_items.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center border border-dashed rounded-md">No line items, add manually or upload a receipt for AI extraction.</p>
              ) : (
                <div className="space-y-1.5">
                  {form.line_items.map(li => (
                    <div key={li.id} className="flex items-center gap-2">
                      <Input value={li.description} onChange={e => updateLineItem(li.id, 'description', e.target.value)} className="h-7 text-xs flex-1" placeholder="Item description..." />
                      <div className="relative w-24 shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                        <Input type="number" min="0" step="0.01" value={li.amount} onChange={e => updateLineItem(li.id, 'amount', parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right pl-4 w-24" />
                      </div>
                      <button onClick={() => removeLineItem(li.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Billable Toggle */}
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Switch checked={form.billable} onCheckedChange={v => setForm(f => ({ ...f, billable: v }))} />
              <div>
                <Label className="text-sm font-medium">Billable to client</Label>
                <p className="text-xs text-muted-foreground">Billable expenses can be imported into estimates.</p>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Notes</label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." className="h-16 resize-none text-sm" />
            </div>

            <div className="flex justify-between gap-2 pt-2 border-t border-border">
              {isEditMode ? (
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  Delete
                </Button>
              ) : <div />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isEditMode ? 'Save Changes' : 'Save Expense'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CameraCapture
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={(file) => handleFileUpload({ target: { files: [file] } })}
      />

      {dupWarning && (
        <DuplicateExpenseWarningDialog
          open={!!dupWarning}
          onOpenChange={() => setDupWarning(null)}
          newExpense={{ ...dupWarning.pendingPayload, line_items: form.line_items }}
          existingExpense={dupWarning.existingExpense}
          onSubmitAnyway={async () => {
            setDupWarning(null);
            await commitSave(dupWarning.pendingPayload);
          }}
          onDiscard={() => {
            setDupWarning(null);
            handleClose();
          }}
        />
      )}
    </>
  );
}