// Builds a client-document color palette from a tenant's brand colors. Text stays dark and legible
// (a deepened shade of the brand primary), while the brand accent is reserved for structural
// elements: rules, dividers, section bars, the title, and totals. Backgrounds stay neutral cream.
// Falls back to the original Legacy olive palette when a tenant has no brand colors set.

function normalizeHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(h) ? h : null;
}
function toRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function hex(r, g, b) {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}
// Mix a color toward black (amt 0..1) or toward white (negative amt).
function shade(rgb, amt) {
  if (amt >= 0) return hex(rgb.r * (1 - amt), rgb.g * (1 - amt), rgb.b * (1 - amt));
  const t = -amt;
  return hex(rgb.r + (255 - rgb.r) * t, rgb.g + (255 - rgb.g) * t, rgb.b + (255 - rgb.b) * t);
}
function luminance(rgb) {
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

const LEGACY = {
  olive: '#3d3d1e', oliveMid: '#5a5a2a', oliveLight: '#8a8a52',
  cream: '#f7f4ee', creamDark: '#ede8dc', warmWhite: '#faf8f4', rule: '#c8c09a',
  accent: '#8a8a52', accentSoft: '#ede8dc',
};

export function docPalette(primaryHex, accentHex) {
  const p = toRgb(primaryHex);
  const a = toRgb(accentHex);
  if (!p && !a) return LEGACY;

  // Text: a deep, legible shade of the brand primary (deepen it hard if it's a bright color,
  // lightly if it's already dark like a forest green).
  const base = p || a;
  const bright = luminance(base) > 0.28;
  const accentRgb = a || p;

  return {
    olive: bright ? shade(base, 0.62) : shade(base, 0.15),   // primary heading / body text
    oliveMid: bright ? shade(base, 0.45) : shade(base, 0.05), // secondary text
    oliveLight: shade(base, -0.35),                          // muted labels (lightened brand tone)
    cream: '#f7f4ee',
    creamDark: '#ede8dc',
    warmWhite: '#faf8f4',
    rule: shade(accentRgb, -0.55),                           // subtle dividers/borders
    accent: (accentHex && a) ? accentHex : shade(accentRgb, 0), // structural accent: bars, title, totals
    accentSoft: shade(accentRgb, -0.82),                     // faint accent wash for section bars
  };
}
