import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ImageOff } from 'lucide-react';

/**
 * Displays an image from either a public URL or a private file URI.
 * Private URIs (base44-private://) are resolved to short-lived signed URLs automatically.
 */
export default function SignedImage({ src, alt = '', className = '', fallback = null }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) { setUrl(null); return; }

    // Private URI, needs a signed URL
    if (src.startsWith('base44-private://') || src.includes('/private/')) {
      let cancelled = false;
      base44.integrations.Core.CreateFileSignedUrl({ file_uri: src, expires_in: 600 })
        .then(res => { if (!cancelled) setUrl(res.signed_url); })
        .catch(() => { if (!cancelled) setError(true); });
      return () => { cancelled = true; };
    }

    // Regular public URL, use directly
    setUrl(src);
  }, [src]);

  if (error || (!url && src)) {
    return fallback || (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className}`}>
        <ImageOff className="w-4 h-4" />
      </div>
    );
  }

  if (!url) return null;

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
}