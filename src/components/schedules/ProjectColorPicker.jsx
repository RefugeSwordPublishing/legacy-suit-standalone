const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#10B981', '#14B8A6',
  '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#D946EF',
  '#EC4899', '#F43F5E', '#64748B', '#6B7280'
];

export default function ProjectColorPicker({ color, onChange }) {
  const isCustom = !PRESET_COLORS.includes(color);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`w-full h-10 rounded-lg border-2 transition-all ${
              color === c ? 'border-foreground scale-110' : 'border-border'
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={e => onChange(e.target.value)}
          className="w-12 h-10 rounded-lg cursor-pointer"
        />
        <input
          type="text"
          value={color}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-3 py-2 border border-border rounded-lg text-sm"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}