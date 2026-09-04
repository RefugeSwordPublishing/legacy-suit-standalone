// Per-tenant branding: font pairings + color helpers. The app's theme colors are HSL *channels*
// (e.g. "37 44% 49%"), so a tenant's hex brand color is converted to that format before being set
// on the CSS variables. Fonts are applied by overriding --font-butler (heading) and --font-highway
// (body); non-default pairings load their web fonts from Google Fonts on demand.

export const FONT_PAIRINGS = {
  default: { label: 'GuildWright (default)', heading: "'Fraunces', Georgia, serif", body: "'Inter', system-ui, sans-serif", google: [] },
  modern:  { label: 'Modern (Poppins / Inter)', heading: "'Poppins', sans-serif", body: "'Inter', system-ui, sans-serif", google: ['Poppins:wght@600;700', 'Inter:wght@400;500;600'] },
  classic: { label: 'Classic (Playfair / Lato)', heading: "'Playfair Display', Georgia, serif", body: "'Lato', system-ui, sans-serif", google: ['Playfair+Display:wght@600;700', 'Lato:wght@400;700'] },
  bold:    { label: 'Bold (Oswald / Roboto)', heading: "'Oswald', sans-serif", body: "'Roboto', system-ui, sans-serif", google: ['Oswald:wght@500;600', 'Roboto:wght@400;500'] },
  system:  { label: 'System (serif / sans)', heading: "Georgia, 'Times New Roman', serif", body: "system-ui, -apple-system, sans-serif", google: [] },
};

function normalizeHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(h) ? h : null;
}

// "#B58A45" -> "37 44% 49%" (HSL channels), or null if not a valid hex.
export function hexToHslChannels(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hue = 0, s = 0; const l = (max + min) / 2;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue /= 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// A readable foreground (near-black or near-white) for text on top of the given brand color.
export function readableForeground(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? '0 0% 10%' : '0 0% 98%';
}
