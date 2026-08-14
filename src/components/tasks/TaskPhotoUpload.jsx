import { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Camera, Upload, X, Loader2 } from 'lucide-react';

export default function TaskPhotoUpload({ photoUrls = [], onChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
    onChange([...photoUrls, file_url]);
    setUploading(false);
    e.target.value = '';
  };

  const remove = (url) => onChange(photoUrls.filter(u => u !== url));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photoUrls.map((url, i) => (
          <div key={i} className="relative group w-16 h-16 shrink-0">
            <img
              src={url}
              alt={`photo-${i}`}
              className="w-16 h-16 rounded-lg object-cover border border-border cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setLightbox(url)}
            />
            <button
              onClick={() => remove(url)}
              className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}

        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => { fileRef.current.removeAttribute('capture'); fileRef.current.click(); }}
            disabled={uploading}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-accent flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-accent transition-colors disabled:opacity-50"
            title="Upload photo"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span className="text-[9px]">Upload</span>
          </button>
          <button
            type="button"
            onClick={() => { fileRef.current.setAttribute('capture', 'environment'); fileRef.current.click(); }}
            disabled={uploading}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-accent flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-accent transition-colors disabled:opacity-50"
            title="Take photo"
          >
            <Camera className="w-4 h-4" />
            <span className="text-[9px]">Camera</span>
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="full" className="max-w-full max-h-full rounded-lg object-contain" />
          <button
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70"
            onClick={() => setLightbox(null)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}