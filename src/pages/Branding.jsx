import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { base44, supabase } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Palette, Trash2, LifeBuoy } from 'lucide-react';

const SUPPORT_EMAIL = 'support@guildwright.app';

// Pull a suggested palette from an uploaded logo. Runs on the local data URL, so no CORS and no
// round trip. Ported from the admin console, where it has been doing this job for white-glove
// onboarding; tenants get the same help now that they set their own branding.
function extractPalette(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 64;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      const buckets = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a < 200) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max < 40 || min > 215) continue;          // skip near-black and near-white
        if (max - min < 25) continue;                  // skip greys, they make dull brand colours
        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        cur.n++; cur.r += r; cur.g += g; cur.b += b;
        buckets.set(key, cur);
      }
      const sorted = [...buckets.values()].sort((x, y) => y.n - x.n);
      const hex = (v) => '#' + [v.r / v.n, v.g / v.n, v.b / v.n].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
      if (!sorted.length) return resolve(null);
      resolve({ primary: hex(sorted[0]), accent: hex(sorted[1] || sorted[0]) });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

const FIELDS = [
  { key: 'logo_url', label: 'Letterhead logo', hint: 'Wide logo shown on estimates, invoices and the client portal. PNG with a transparent background works best.' },
  { key: 'logo_icon_url', label: 'Icon', hint: 'Square mark used where the full logo will not fit.' },
];

export default function Branding() {
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();
  const [form, setForm] = useState({ logo_url: '', logo_icon_url: '', brand_primary: '', brand_accent: '', brand_theme: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  // currentUser does not carry company_id, so take it from the settings row RLS already scoped.
  const [companyId, setCompanyId] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpText, setHelpText] = useState('');
  const [helpSending, setHelpSending] = useState(false);
  const fileRefs = useRef({});

  const canEdit = ['owner', 'admin'].includes(currentUser?.role);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('company_settings')
        .select('company_id, logo_url, logo_icon_url, brand_primary, brand_accent, brand_theme').maybeSingle();
      if (data) {
        setCompanyId(data.company_id);
        setForm({
          logo_url: data.logo_url || '', logo_icon_url: data.logo_icon_url || '',
          brand_primary: data.brand_primary || '', brand_accent: data.brand_accent || '',
          brand_theme: data.brand_theme || '',
        });
      }
      setLoading(false);
    })();
  }, []);

  if (currentUser && !canEdit) return <Navigate to="/settings" replace />;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const upload = async (key, file) => {
    if (!file) return;
    setUploading(key);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set(key, file_url);
      // Only the letterhead logo suggests colours; the icon is usually a crop of the same mark.
      if (key === 'logo_url') {
        const dataUrl = await new Promise((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.readAsDataURL(file);
        });
        const palette = await extractPalette(dataUrl);
        if (palette && !form.brand_primary && !form.brand_accent) {
          setForm((f) => ({ ...f, logo_url: file_url, brand_primary: palette.primary, brand_accent: palette.accent }));
          toast({ title: 'Colours suggested from your logo', description: 'Adjust them below if they are not right.' });
        }
      }
    } catch (e) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    }
    setUploading('');
  };

  const save = async () => {
    setSaving(true);
    const norm = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const { error } = await supabase.from('company_settings').update({
      logo_url: norm(form.logo_url),
      logo_icon_url: norm(form.logo_icon_url),
      brand_primary: norm(form.brand_primary),
      brand_accent: norm(form.brand_accent),
      brand_theme: form.brand_theme === 'light' || form.brand_theme === 'dark' ? form.brand_theme : null,
    }).eq('company_id', companyId);
    setSaving(false);
    if (error) { toast({ title: 'Could not save', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Branding saved', description: 'Your estimates, invoices and client portal use it from now on.' });
  };

  const sendHelp = async () => {
    if (!helpText.trim()) return;
    setHelpSending(true);
    const userName = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.full_name || currentUser?.email;
    try {
      await base44.entities.SupportTicket.create({
        user_id: currentUser?.id, user_email: currentUser?.email, user_name: userName,
        page: '/branding', category: 'branding', description: helpText.trim(), status: 'open',
      });
      try {
        await base44.functions.invoke('sendEmail', {
          to: SUPPORT_EMAIL,
          subject: `Branding help request from ${userName}`,
          text: helpText.trim(),
        });
      } catch { /* the ticket is the record; the email is a nicety */ }
      setHelpOpen(false); setHelpText('');
      toast({ title: 'Request sent', description: 'We will get back to you at your account email.' });
    } catch (e) {
      toast({ title: 'Could not send the request', description: e.message, variant: 'destructive' });
    }
    setHelpSending(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-butler text-foreground flex items-center gap-2"><Palette className="w-6 h-6" /> Branding</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your logo and colours on every estimate, invoice and client-facing page.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setHelpOpen((v) => !v)}>
          <LifeBuoy className="w-4 h-4" /> Need help with your graphics?
        </Button>
      </div>

      {helpOpen && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-sm text-foreground font-medium">Tell us what you need</p>
          <p className="text-xs text-muted-foreground">
            No logo yet, a file in the wrong format, or colours that are not landing. Describe it and we will
            take it from there. Send files to {SUPPORT_EMAIL} and we will match them to this request.
          </p>
          <textarea
            value={helpText} onChange={(e) => setHelpText(e.target.value)} rows={4}
            placeholder="For example: we have a logo on our truck but only a photo of it."
            className="w-full rounded-lg border border-border bg-background p-2 text-sm"
          />
          <div className="flex gap-2 sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => { setHelpOpen(false); setHelpText(''); }}>Cancel</Button>
            <Button size="sm" onClick={sendHelp} disabled={helpSending || !helpText.trim()}>
              {helpSending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null} Send request
            </Button>
          </div>
        </div>
      )}

      {FIELDS.map(({ key, label, hint }) => (
        <div key={key} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div>
            <Label className="text-sm font-semibold">{label}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="h-16 w-40 rounded border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
              {form[key]
                ? <img src={form[key]} alt={label} className="max-h-full max-w-full object-contain" />
                : <span className="text-xs text-muted-foreground">Nothing yet</span>}
            </div>
            <input
              ref={(el) => { fileRefs.current[key] = el; }}
              type="file" accept="image/*" className="hidden"
              onChange={(e) => upload(key, e.target.files?.[0])}
            />
            <Button variant="outline" size="sm" className="gap-2" disabled={!!uploading}
              onClick={() => fileRefs.current[key]?.click()}>
              {uploading === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {form[key] ? 'Replace' : 'Upload'}
            </Button>
            {form[key] && (
              <Button variant="ghost" size="sm" className="gap-2 text-destructive" onClick={() => set(key, '')}>
                <Trash2 className="w-4 h-4" /> Remove
              </Button>
            )}
          </div>
        </div>
      ))}

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div>
          <Label className="text-sm font-semibold">Colours</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload a logo and we suggest these from it. Change them here if the suggestion is off.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[['brand_primary', 'Primary'], ['brand_accent', 'Accent']].map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs">{label}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color" value={form[key] || '#B58A45'}
                  onChange={(e) => set(key, e.target.value)}
                  className="h-9 w-12 rounded border border-border bg-background p-1 cursor-pointer"
                />
                <Input value={form[key] || ''} onChange={(e) => set(key, e.target.value)} placeholder="#B58A45" className="font-mono text-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null} Save branding
        </Button>
      </div>
    </div>
  );
}
