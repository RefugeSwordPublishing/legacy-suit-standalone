import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { canManageProjects } from '@/lib/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FolderOpen, Upload, Trash2, FileText, X } from 'lucide-react';
import { differenceInDays } from 'date-fns';

const categoryConfig = {
  plans:       { label: 'Plans',       className: 'bg-blue-100 text-blue-700 border-blue-200' },
  general:     { label: 'General',     className: 'bg-slate-100 text-slate-600 border-slate-200' },
  corrections: { label: 'Corrections', className: 'bg-orange-100 text-orange-700 border-orange-200' },
};

function Thumbnail({ file, onClick }) {
  const isImage = file.file_type?.startsWith('image/');
  const isPdf = file.file_type === 'application/pdf';
  return (
    <div
      className="group cursor-pointer flex flex-col gap-1"
      onClick={() => onClick(file)}
    >
      <div className="w-full aspect-square rounded-lg border border-border overflow-hidden bg-muted/40 flex items-center justify-center hover:border-accent transition-all hover:shadow-md">
        {isImage ? (
          <img src={file.file_url} alt={file.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
        ) : isPdf ? (
          <div className="flex flex-col items-center gap-2 p-3 text-center">
            <FileText className="w-8 h-8 text-red-500" />
            <span className="text-xs text-muted-foreground font-medium uppercase">PDF</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 p-3 text-center">
            <FileText className="w-8 h-8 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase">{file.file_type?.split('/')[1] || 'file'}</span>
          </div>
        )}
      </div>
      <div className="px-0.5">
        <p className="text-xs font-medium truncate text-foreground">{file.name}</p>
        <Badge variant="outline" className={`${categoryConfig[file.category]?.className || categoryConfig.general.className} text-[10px] mt-0.5`}>
          {categoryConfig[file.category]?.label || 'General'}
        </Badge>
      </div>
    </div>
  );
}

function LightboxModal({ file, onClose }) {
  const isImage = file?.file_type?.startsWith('image/');
  const isPdf = file?.file_type === 'application/pdf';

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-5xl flex flex-col gap-2" style={{ height: '90vh' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-1 shrink-0">
          <p className="text-white/90 text-sm font-medium truncate">{file.name}</p>
          <div className="flex items-center gap-2">
            <a
              href={file.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/70 hover:text-white border border-white/30 rounded px-2 py-1 transition-colors"
              onClick={e => e.stopPropagation()}
            >
              Open in new tab
            </a>
            <button onClick={onClose} className="text-white/70 hover:text-white ml-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 rounded-lg overflow-hidden shadow-2xl">
          {isImage ? (
            <img src={file.file_url} alt={file.name} className="w-full h-full object-contain" />
          ) : isPdf ? (
            <iframe
              src={file.file_url}
              title={file.name}
              className="w-full h-full border-0 rounded-lg bg-white"
            />
          ) : (
            <div className="bg-card rounded-lg h-full flex flex-col items-center justify-center gap-4">
              <FileText className="w-16 h-16 text-muted-foreground" />
              <p className="font-medium text-foreground">{file.name}</p>
              <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                <Button>Open File</Button>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectFilesList({ files, projectId, projectStatus, projectUpdatedDate, onRefresh }) {
  const { currentUser } = useCurrentUser();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [category, setCategory] = useState('general');
  const [lightboxFile, setLightboxFile] = useState(null);
  const fileRef = useRef();

  const canManage = canManageProjects(currentUser);

  // Auto-delete files if project completed for 14+ days
  useEffect(() => {
    const isCompleted = projectStatus === 'completed';
    const daysSinceUpdate = projectUpdatedDate ? differenceInDays(new Date(), new Date(projectUpdatedDate)) : 0;
    if (isCompleted && daysSinceUpdate >= 14 && files.length > 0) {
      Promise.all(files.map(f => base44.entities.ProjectFile.delete(f.id))).then(() => onRefresh());
    }
  }, [projectStatus, projectUpdatedDate, files.length]);

  const onFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setSelectedFile(f);
    setFileName(f.name);
  };

  const handleUpload = async () => {
    if (!selectedFile || !fileName.trim()) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });
    await base44.entities.ProjectFile.create({
      project_id: projectId,
      name: fileName.trim(),
      file_url,
      file_type: selectedFile.type,
      category,
      uploaded_by: currentUser?.full_name || currentUser?.email || 'Unknown',
    });
    setUploading(false);
    setUploadOpen(false);
    setSelectedFile(null);
    setFileName('');
    setCategory('general');
    onRefresh();
  };

  const handleDelete = async (fileId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this file?')) return;
    await base44.entities.ProjectFile.delete(fileId);
    onRefresh();
  };

  const sorted = [...files].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  return (
    <>
      {lightboxFile && <LightboxModal file={lightboxFile} onClose={() => setLightboxFile(null)} />}

      <Card className="border border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-accent" />
              Files
              <span className="text-sm font-normal text-muted-foreground">({files.length})</span>
            </CardTitle>
            {canManage && (
              <Button size="sm" className="h-8 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setUploadOpen(true)}>
                <Upload className="w-3.5 h-3.5 mr-1" /> Upload
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {sorted.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Upload blueprints, layouts, or status photos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {sorted.map(f => (
                <div key={f.id} className="relative group">
                  <Thumbnail file={f} onClick={setLightboxFile} />
                  {canManage && (
                    <button
                      onClick={(e) => handleDelete(f.id, e)}
                      className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>

        {/* Upload Dialog */}
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4" /> Upload File</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>File *</Label>
                <input ref={fileRef} type="file" accept="image/*,.pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx" onChange={onFileChange} className="hidden" />
                <Button variant="outline" className="w-full mt-1 justify-start text-muted-foreground" onClick={() => fileRef.current?.click()}>
                  {selectedFile ? selectedFile.name : 'Choose file…'}
                </Button>
              </div>
              <div>
                <Label>Display Name *</Label>
                <Input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="e.g. Floor Plan v2" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plans">Plans</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="corrections">Corrections</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleUpload} disabled={!selectedFile || !fileName.trim() || uploading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                {uploading ? 'Uploading...' : 'Upload File'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    </>
  );
}