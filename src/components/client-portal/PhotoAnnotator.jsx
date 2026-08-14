import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Minus, Circle, ArrowRight, Undo2, Check, X } from 'lucide-react';

const TOOLS = [
  { id: 'line',   label: 'Line',   icon: Minus },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'arrow',  label: 'Arrow',  icon: ArrowRight },
];

export default function PhotoAnnotator({ imageDataUrl, onDone, onCancel }) {
  const canvasRef = useRef();
  const [tool, setTool] = useState('arrow');
  const [color, setColor] = useState('#ef4444');
  const [shapes, setShapes] = useState([]);
  const [drawing, setDrawing] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const maxW = Math.min(img.naturalWidth, window.innerWidth - 48);
      const maxH = window.innerHeight - 200;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setImgSize({ w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) });
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  useEffect(() => { redraw(); }, [shapes, drawing, imgSize]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imgSize.w) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, imgSize.w, imgSize.h);
      [...shapes, drawing].filter(Boolean).forEach(s => drawShape(ctx, s));
    };
    img.src = imageDataUrl;
  };

  const drawShape = (ctx, s) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (s.type === 'line') {
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    } else if (s.type === 'circle') {
      const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
      ctx.beginPath(); ctx.ellipse(s.x1 + (s.x2 - s.x1) / 2, s.y1 + (s.y2 - s.y1) / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (s.type === 'arrow') {
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const len = 14;
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - len * Math.cos(angle - Math.PI / 6), s.y2 - len * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(s.x2 - len * Math.cos(angle + Math.PI / 6), s.y2 - len * Math.sin(angle + Math.PI / 6));
      ctx.closePath(); ctx.fillStyle = s.color; ctx.fill();
    }
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    const p = getPos(e);
    setDrawing({ type: tool, color, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };
  const onMouseMove = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    setDrawing(d => ({ ...d, x2: p.x, y2: p.y }));
  };
  const onMouseUp = (e) => {
    if (!drawing) return;
    setShapes(s => [...s, drawing]);
    setDrawing(null);
  };

  const handleDone = () => {
    const canvas = canvasRef.current;
    onDone(canvas.toDataURL('image/jpeg', 0.92));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-black/90 flex-wrap">
        <span className="text-white text-sm font-medium mr-2">Annotate:</span>
        {TOOLS.map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tool === t.id ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          {['#ef4444','#3b82f6','#22c55e','#f59e0b','#ffffff'].map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-white scale-125' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <button onClick={() => setShapes(s => s.slice(0, -1))} className="ml-auto text-white/70 hover:text-white p-1">
          <Undo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-4">
        {imgSize.w > 0 && (
          <canvas
            ref={canvasRef}
            width={imgSize.w}
            height={imgSize.h}
            className="touch-none cursor-crosshair rounded-lg"
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
            onTouchStart={onMouseDown} onTouchMove={onMouseMove} onTouchEnd={onMouseUp}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-3 px-4 py-4 bg-black/90">
        <Button variant="outline" onClick={onCancel} className="flex-1 border-white/30 text-white hover:bg-white/10">
          <X className="w-4 h-4" /> Cancel
        </Button>
        <Button onClick={handleDone} className="flex-1 bg-accent text-accent-foreground">
          <Check className="w-4 h-4" /> Use Photo
        </Button>
      </div>
    </div>
  );
}