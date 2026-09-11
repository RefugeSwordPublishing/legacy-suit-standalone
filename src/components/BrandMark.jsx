// GuildWright mark: a flat plumb-bob (Aged Brass) in a maker's stamp (Forge Black).
// Geometric and two-color so it scales cleanly from favicon to signage.
export default function BrandMark({ size = 44, rounded = true, bg = '#262525', mark = '#B58A45', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} role="img" aria-label="GuildWright">
      {rounded && <rect width="100" height="100" rx="20" fill={bg} />}
      <g fill={mark}>
        {/* cap knob + bar */}
        <rect x="45" y="14" width="10" height="6" rx="1.5" />
        <rect x="38" y="21" width="24" height="6" rx="1.5" />
        {/* string */}
        <rect x="47" y="27" width="6" height="13" />
        {/* the bob: widest near the top, tapering to a plumb point */}
        <path d="M50 38 L62 47 L66 59 L50 88 L34 59 L38 47 Z" />
      </g>
    </svg>
  );
}
