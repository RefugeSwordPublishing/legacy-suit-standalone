import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, X, RefreshCw } from 'lucide-react';

// In-app camera using getUserMedia (not the system camera input, which was slow
// and crash-prone). Captures a downscaled JPEG and returns it as a File.
export default function CameraCapture({ open, onOpenChange, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState('environment');

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setReady(false);
  };

  const start = async (facingMode) => {
    setError('');
    setReady(false);
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This device or browser does not support in-app camera. Use "Upload" instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch (e) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access for this site, or use "Upload".'
          : 'Could not open the camera. Use "Upload" instead.'
      );
    }
  };

  useEffect(() => {
    if (open) start(facing);
    else stop();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(vw, vh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture?.(file);
      onOpenChange(false);
    }, 'image/jpeg', 0.85);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden bg-black border-black">
        <div className="relative">
          {error ? (
            <div className="p-8 text-center text-sm text-white/90 bg-neutral-900">
              <Camera className="w-8 h-8 mx-auto mb-3 opacity-60" />
              {error}
            </div>
          ) : (
            <video ref={videoRef} playsInline muted className="w-full max-h-[70vh] object-contain bg-black" />
          )}

          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 rounded-full bg-black/50 text-white p-2 hover:bg-black/70"
            aria-label="Close camera"
          >
            <X className="w-5 h-5" />
          </button>

          {!error && (
            <div className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-6 p-4 bg-gradient-to-t from-black/70 to-transparent">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))}
                className="text-white hover:bg-white/15 rounded-full"
                aria-label="Switch camera"
              >
                <RefreshCw className="w-5 h-5" />
              </Button>
              <button
                onClick={capture}
                disabled={!ready}
                className="w-16 h-16 rounded-full bg-white border-4 border-white/40 disabled:opacity-40 active:scale-95 transition-transform"
                aria-label="Take photo"
              />
              <div className="w-10" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
