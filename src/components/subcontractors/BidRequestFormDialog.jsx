import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Upload, X, FileText, Image, Gavel, ClipboardCheck } from 'lucide-react';
import AddressAutocomplete from './AddressAutocomplete';
import { sortByName } from '@/lib/naturalSort';

const CONTRACTOR_TYPES = [
  'Plumber', 'Electrician', 'Framing', 'Roofer', 'Siding/Gutters',
  'Drywall', 'Painter', 'Flooring', 'Landscaping', 'Trim Work',
  'Miscellaneous', 'HVAC'
];

const genId = () => Math.random().toString(36).slice(2, 10);

const BLANK = {
  request_type: 'bid',
  title: '',
  project_id: '',
  project_name: '',
  project_address: '',
  description: '',
  budget: '',
  scope_of_work: [],
  photo_urls: [],
  file_urls: [],
  file_names: [],
  sub_contractor_ids: [],
  eta_window_start: '',
  eta_window_end: '',
};

export default function BidRequestFormDialog({ open, onOpenChange, bidRequest = null, onSaved }) {
  const { currentUser } = useCurrentUser();
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newScopeItem, setNewScopeItem] = useState('');
  const [typeFilters, setTypeFilters] = useState([]);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-for-bid'],
    queryFn: () => base44.entities.Project.list('-created_date', 50),
    enabled: open,
  });

  const { data: subs = [] } = useQuery({
    queryKey: ['sub-contractors'],
    queryFn: () => base44.entities.SubContractor.list(),
    enabled: open,
  });

  useEffect(() => {
    if (open) setForm(bidRequest ? { ...BLANK, ...bidRequest } : BLANK);
  }, [open, bidRequest]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isEstimate = form.request_type === 'estimate';

  const handleProjectChange = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    set('project_id', projectId);
    set('project_name', project?.name || '');
    set('project_address', project?.address || '');
  };

  const addScopeItem = () => {
    if (!newScopeItem.trim()) return;
    set('scope_of_work', [...form.scope_of_work, { id: genId(), title: newScopeItem.trim(), completed: false }]);
    setNewScopeItem('');
  };

  const removeScopeItem = (id) => {
    set('scope_of_work', form.scope_of_work.filter(s => s.id !== id));
  };

  const toggleSub = (subId) => {
    if (isEstimate) {
      // Estimate: single contractor only
      set('sub_contractor_ids', [(form.sub_contractor_ids || [])[0] === subId ? '' : subId].filter(Boolean));
    } else {
      const ids = form.sub_contractor_ids || [];
      if (ids.includes(subId)) {
        set('sub_contractor_ids', ids.filter(id => id !== subId));
      } else {
        set('sub_contractor_ids', [...ids, subId]);
      }
    }
  };

  const handleFileUpload = async (e, type) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (type === 'photo') {
        set('photo_urls', [...(form.photo_urls || []), file_url]);
      } else {
        set('file_urls', [...(form.file_urls || []), file_url]);
        set('file_names', [...(form.file_names || []), file.name]);
      }
    }
    setUploading(false);
    e.target.value = '';
  };

  const removePhoto = (idx) => set('photo_urls', form.photo_urls.filter((_, i) => i !== idx));
  const removeFile = (idx) => {
    set('file_urls', form.file_urls.filter((_, i) => i !== idx));
    set('file_names', form.file_names.filter((_, i) => i !== idx));
  };

  // Email each selected sub-contractor an invitation with a link to submit their bid. Best-effort
  // per contractor (send-email edge fn -> Resend). Replaces the old subContractorBid stub, which was
  // never wired in the adapter, so bid-request emails silently never sent.
  const notifySubs = async (bidReqId, subIds, { updated = false } = {}) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.guildwright.app';
    const link = `${origin}/submit-bid/${bidReqId}`;
    const kind = isEstimate ? 'estimate' : 'bid';
    const scopeList = (form.scope_of_work || []).map(s => `<li>${s.title}</li>`).join('');
    const selected = subs.filter(s => (subIds || []).includes(s.id) && s.email);
    for (const sub of selected) {
      const greeting = sub.contact_name || sub.name || 'there';
      const subject = updated
        ? `Updated ${kind} request: ${form.title || 'Project'}`
        : `${isEstimate ? 'Estimate' : 'Bid'} request: ${form.title || 'New project'}`;
      const html = `<p>Hi ${greeting},</p>`
        + `<p>You've been invited to submit ${isEstimate ? 'an estimate' : 'a bid'} for <strong>${form.title || 'a project'}</strong>${form.project_address ? ` at ${form.project_address}` : ''}.</p>`
        + (form.description ? `<p>${form.description}</p>` : '')
        + (scopeList ? `<p><strong>Scope:</strong></p><ul>${scopeList}</ul>` : '')
        + `<p><a href="${link}">Submit your ${kind} here</a></p>`
        + `<p>Or paste this link into your browser: ${link}</p>`;
      try {
        await base44.functions.invoke('sendEmail', { to: sub.email, subject, html });
      } catch { /* best-effort; a failed email shouldn't block the request */ }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        ...form,
        budget: form.budget ? parseFloat(form.budget) : null,
        created_by_name: currentUser ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() : undefined,
      };
      if (bidRequest) {
        await base44.entities.BidRequest.update(bidRequest.id, data);
        const wasSent = ['sent', 'reviewing', 'awarded'].includes(bidRequest.status);
        if (wasSent && (bidRequest.sub_contractor_ids || []).length > 0) {
          await notifySubs(bidRequest.id, bidRequest.sub_contractor_ids, { updated: true });
        }
      } else {
        const created = await base44.entities.BidRequest.create(data);
        if ((form.sub_contractor_ids || []).length > 0 && created?.id) {
          await notifySubs(created.id, form.sub_contractor_ids);
          await base44.entities.BidRequest.update(created.id, { status: 'sent' });
        }
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const filteredSubs = subs.filter(sub => {
    if (typeFilters.length === 0) return true;
    const types = sub.contractor_types || (sub.contractor_type ? [sub.contractor_type] : []);
    return typeFilters.some(f => types.includes(f));
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bidRequest ? 'Edit' : 'New'} {isEstimate ? 'Estimate Approval' : 'Bid Request'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Request Type Toggle */}
          {!bidRequest && (
            <div>
              <Label className="mb-2 block">Request Type</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => set('request_type', 'bid')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors text-sm font-medium ${
                    !isEstimate ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <Gavel className="w-5 h-5" />
                  Bid Request
                  <span className="text-xs font-normal text-muted-foreground text-center">Contractors submit competing prices</span>
                </button>
                <button
                  type="button"
                  onClick={() => set('request_type', 'estimate')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors text-sm font-medium ${
                    isEstimate ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <ClipboardCheck className="w-5 h-5" />
                  Estimate Approval
                  <span className="text-xs font-normal text-muted-foreground text-center">You set the price, they approve & schedule</span>
                </button>
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <Label className="mb-1 block">Title *</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Electrical Panel Replacement" required />
          </div>

          {/* Project */}
          <div>
            <Label className="mb-1 block">Project</Label>
            <Select value={form.project_id || ''} onValueChange={handleProjectChange}>
              <SelectTrigger><SelectValue placeholder="Select a project…" /></SelectTrigger>
              <SelectContent>
                {sortByName(projects).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1 block">Property Address</Label>
            <AddressAutocomplete value={form.project_address} onChange={v => set('project_address', v)} />
          </div>

          <div>
            <Label className="mb-1 block">Description</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe the work needed…" rows={3} />
          </div>

          {/* Budget label changes based on type */}
          <div>
            <Label className="mb-1 block">
              {isEstimate ? (
                <>Preset Price ($) <span className="text-xs text-muted-foreground font-normal">, shown to contractor for approval</span></>
              ) : (
                <>Internal Budget ($) <span className="text-xs text-muted-foreground font-normal">, not visible to sub-contractors</span></>
              )}
            </Label>
            <Input
              type="number" min="0" step="0.01"
              value={form.budget || ''}
              onChange={e => set('budget', e.target.value)}
              placeholder="e.g. 15000"
            />
          </div>

          {/* Scheduling window, estimate only */}
          {isEstimate && (
            <div>
              <Label className="mb-2 block">
                Scheduling Window <span className="text-xs text-muted-foreground font-normal">, contractor picks their start date within this range</span>
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Earliest Start</Label>
                  <Input type="date" value={form.eta_window_start} onChange={e => set('eta_window_start', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Latest Start</Label>
                  <Input type="date" value={form.eta_window_end} onChange={e => set('eta_window_end', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Scope of Work */}
          <div>
            <Label className="mb-2 block">Scope of Work</Label>
            <div className="space-y-1.5 mb-2">
              {(form.scope_of_work || []).map(item => (
                <div key={item.id} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                  <span className="text-sm flex-1">{item.title}</span>
                  <button onClick={() => removeScopeItem(item.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newScopeItem}
                onChange={e => setNewScopeItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addScopeItem())}
                placeholder="Add scope item…"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addScopeItem} disabled={!newScopeItem.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Photos */}
          <div>
            <Label className="mb-2 block">Project Photos</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(form.photo_urls || []).map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border" />
                  <button onClick={() => removePhoto(i)} className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <Button type="button" variant="outline" size="sm" asChild>
                <span><Image className="w-3.5 h-3.5 mr-1.5" />{uploading ? 'Uploading…' : 'Add Photos'}</span>
              </Button>
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleFileUpload(e, 'photo')} disabled={uploading} />
            </label>
          </div>

          {/* Documents */}
          <div>
            <Label className="mb-2 block">Documents (blueprints, plans, etc.)</Label>
            <div className="space-y-1.5 mb-2">
              {(form.file_urls || []).map((url, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1 truncate">{(form.file_names || [])[i] || `File ${i + 1}`}</span>
                  <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <Button type="button" variant="outline" size="sm" asChild>
                <span><Upload className="w-3.5 h-3.5 mr-1.5" />{uploading ? 'Uploading…' : 'Attach Files'}</span>
              </Button>
              <input type="file" multiple className="hidden" onChange={e => handleFileUpload(e, 'file')} disabled={uploading} />
            </label>
          </div>

          {/* Contractor selection */}
          <div>
            <Label className="mb-2 block">
              {isEstimate ? 'Select Contractor' : 'Invite Sub-Contractors'}
              {isEstimate && <span className="text-xs text-muted-foreground font-normal ml-1">, select one</span>}
            </Label>
            {subs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contractors in directory yet. Add them from the Directory tab first.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {CONTRACTOR_TYPES.map(type => (
                    <button
                      key={type} type="button"
                      onClick={() => setTypeFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])}
                      className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                        typeFilters.includes(type)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {filteredSubs.map(sub => {
                    const types = sub.contractor_types || (sub.contractor_type ? [sub.contractor_type] : []);
                    const checked = (form.sub_contractor_ids || []).includes(sub.id);
                    return (
                      <div key={sub.id} className="flex items-center gap-3 py-1">
                        <Checkbox
                          id={`sub-${sub.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleSub(sub.id)}
                        />
                        <label htmlFor={`sub-${sub.id}`} className="flex-1 cursor-pointer">
                          <span className="text-sm font-medium">{sub.business_name || sub.contact_name}</span>
                          {types.length > 0 && <span className="text-xs text-muted-foreground ml-2">· {types.join(', ')}</span>}
                          <span className="text-xs text-muted-foreground ml-2">{sub.email}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || !form.title.trim() || uploading}>
              {saving ? 'Saving...' : bidRequest ? 'Save Changes' : isEstimate ? 'Send for Approval' : 'Create Bid Request'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}