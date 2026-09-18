// Natural (alphanumeric) comparison so "4324 W Maple" sorts before "4400 Oak" and house
// numbers order low to high. Used for project dropdowns and list sorting across the app.
export const naturalCompare = (a, b) =>
  String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });

// Sort a list of projects (or anything with a `name`) by name, alphanumerically.
export const sortByName = (list = []) => [...list].sort((a, b) => naturalCompare(a?.name, b?.name));

// Descending date compare on an ISO-ish string field (newest first); nulls sink to the bottom.
export const byDateDesc = (field) => (a, b) => {
  const av = a?.[field] || '', bv = b?.[field] || '';
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return av < bv ? 1 : av > bv ? -1 : 0;
};
