// Returns the first existing time entry that overlaps [startISO, endISO) for the given user,
// or null if there is no conflict. Endpoints touching is allowed (2:00-2:10 then 2:10-2:20 is
// fine), but any true overlap is a conflict. An open entry (no clock_out) blocks anything after
// its clock_in. Pass excludeId to skip the entry being edited.
export function findOverlap(entries = [], userId, startISO, endISO, excludeId) {
  if (!startISO) return null;
  const s = new Date(startISO).getTime();
  const e = endISO ? new Date(endISO).getTime() : Number.POSITIVE_INFINITY;
  for (const en of entries) {
    if (excludeId && en.id === excludeId) continue;
    if (en.user_id !== userId) continue;
    if (!en.clock_in) continue;
    const es = new Date(en.clock_in).getTime();
    const ee = en.clock_out ? new Date(en.clock_out).getTime() : Number.POSITIVE_INFINITY;
    if (s < ee && es < e) return en; // strict overlap
  }
  return null;
}
