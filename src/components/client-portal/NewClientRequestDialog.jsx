import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Upload, X, Loader2 } from 'lucide-react';
import PhotoAnnotator from './PhotoAnnotator';

export default function NewClientRequestDialog({ project, currentUser, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrls, setPhotoUrls] = useState([]);
  const [annotatingImage, setAnnotatingImage] = useState(null); // base64 string
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();
  const cameraRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setAnnotatingImage(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleAnnotated = async (dataUrl) => {
    setAnnotatingImage(null);
    setUploading(true);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], 'request-photo.jpg', { type: 'image/jpeg' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setPhotoUrls(prev => [...prev, file_url]);
    setUploading(false);
  };

  const removePhoto = (i) => setPhotoUrls(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const clientName = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.email || 'Client';
    await base44.entities.ClientRequest.create({
      project_id: project.id,
      title: title.trim(),
      description: description.trim() || undefined,
      photo_urls: photoUrls,
      status: 'open',
      submitted_by: clientName,
    });

    // Notify admins/COOs/owners about the new request. User maps to user_profiles, so the auth
    // user id (what notifications are keyed by) lives on user_id, not id.
    const allUsers = await base44.entities.User.list();
    const highRoleUsers = allUsers.filter(u => ['owner', 'coo', 'admin'].includes(u.role) && u.user_id);
    for (const admin of highRoleUsers) {
      await base44.entities.Notification.create({
        user_id: admin.user_id,
        type: 'task_assigned',
        title: `New Client Request: ${title.trim()}`,
        message: `New unapproved client request submitted on project "${project.name}" by ${clientName}.`,
        project_id: project.id,
        project_name: project.name,
        read: false,
      });
    }

    setSaving(false);
    onCreated();
  };

  if (annotatingImage) {
    return (
      <PhotoAnnotator
        imageDataUrl={annotatingImage}
        onDone={handleAnnotated}
        onCancel={() => setAnnotatingImage(null)}
      />
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Client Request, {project.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief summary of the issue" />
          </div>

          <div>
            <Label>Description / Comments</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the issue in detail..."
              rows={3}
            />
          </div>

          {/* Photos */}
          <div>
            <Label>Photos</Label>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {photoUrls.map((url, i) => (
                <div key={i} className="relative w-20 h-20">
                  <img src={url} alt="" className="w-full h-full object-cover rounded-lg border border-border" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {uploading && (
                <div className="w-20 h-20 rounded-lg border border-border flex items-center justify-center bg-muted">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span className="text-xs">Upload</span>
              </button>
              <button
                onClick={() => cameraRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Camera className="w-4 h-4" />
                <span className="text-xs">Camera</span>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files[0])} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} disabled={!title.trim() || saving} className="flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Request'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}