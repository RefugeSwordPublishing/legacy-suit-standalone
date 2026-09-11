// Invoice numbering helpers.
// Format tokens: {prefix}, {seq}, {seq:N} (zero-padded to N), {project}, {yyyy}.

const DIRECTIONALS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest']);
const SUFFIXES = new Set(['st', 'street', 'ave', 'avenue', 'rd', 'road', 'dr', 'drive', 'ln', 'lane', 'blvd', 'boulevard', 'ct', 'court', 'way', 'pl', 'place', 'cir', 'circle', 'ter', 'terrace', 'hwy', 'highway', 'pkwy', 'parkway', 'trl', 'trail', 'loop', 'run', 'pass', 'pike', 'sq', 'square', 'aly', 'alley', 'row', 'xing', 'crossing']);
const UNIT_MARKERS = new Set(['apt', 'unit', 'ste', 'suite', 'lot', 'bldg', 'building', 'fl', 'floor', 'rm', 'room', 'trlr']);

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// "4325 W Maple St" -> "4325Maple", "732 Jean Ave" -> "732Jean"
export function deriveInvoicePrefix(address) {
  if (!address) return '';
  const street = String(address).split(',')[0].trim();
  const tokens = street.split(/\s+/).filter(Boolean);
  if (!tokens.length) return '';

  let house = '';
  let idx = 0;
  if (/^\d/.test(tokens[0])) {
    house = tokens[0].replace(/[^0-9A-Za-z]/g, '');
    idx = 1;
  }

  let streetWord = '';
  for (let i = idx; i < tokens.length; i++) {
    const w = tokens[i].toLowerCase().replace(/[^a-z0-9#]/g, '');
    if (!w || w.startsWith('#')) break;
    if (UNIT_MARKERS.has(w)) break;
    if (DIRECTIONALS.has(w)) continue;
    if (SUFFIXES.has(w)) break;
    streetWord = tokens[i].replace(/[^A-Za-z0-9]/g, '');
    break; // first real street-name word only, for a compact prefix
  }

  return `${house}${cap(streetWord)}`;
}

export function formatInvoiceNumber(template, { prefix = '', seq = 1, projectName = '' } = {}) {
  const tpl = template || '{prefix}_{seq:3}';
  return tpl
    .replace(/\{seq:(\d+)\}/g, (_, n) => String(seq).padStart(Number(n), '0'))
    .replace(/\{seq\}/g, String(seq))
    .replace(/\{prefix\}/g, prefix || '')
    .replace(/\{project\}/g, (projectName || '').replace(/\s+/g, ''))
    .replace(/\{yyyy\}/g, String(new Date().getFullYear()));
}
