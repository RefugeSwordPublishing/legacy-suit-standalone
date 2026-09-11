// Offline-capable time clock. Crew can clock in / take breaks / clock out with no signal; the
// shift is stored locally and replayed to the server when the phone reconnects.
//
// Model: an offline clock-in becomes a LOCAL entry (id "local-…") held in localStorage plus a
// queued "create" op. Any later change to that shift while it's still unsynced (break, clock-out)
// is folded into the queued create payload, so the whole shift syncs as ONE create — no need to
// reference a server id that doesn't exist yet. Changes to an already-synced (server) entry queue
// as an "update" op keyed by the real id.
import { base44 } from '@/api/base44Client';
import { v4 as uuidv4 } from 'uuid';

const LS_KEY = 'gw_offline_timeclock_v1';
const CHANGE_EVENT = 'gw-offline-timeclock-change';

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { entries: s.entries || {}, queue: s.queue || [] };
  } catch {
    return { entries: {}, queue: [] };
  }
}

function saveState(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* storage full / disabled */ }
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* no window */ }
}

// All locally-held (unsynced) entries, as an array. Includes still-open and clocked-out shifts
// that haven't reached the server yet.
export function getPendingEntries() {
  return Object.values(loadState().entries);
}

export function pendingCount() {
  return loadState().queue.length;
}

// Subscribe to local-store changes and connectivity flips. Returns an unsubscribe fn.
export function subscribeOffline(cb) {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

// Create a time entry. Sends to the server when online; on no signal (or a failed send) stores it
// locally and queues it. Returns the entry either way (server row, or a local optimistic one).
export async function createEntry(payload) {
  if (navigator.onLine) {
    try {
      return await base44.entities.TimeEntry.create(payload);
    } catch { /* treat as offline and queue below */ }
  }
  const localId = 'local-' + uuidv4();
  const entry = { ...payload, id: localId, _local: true };
  const s = loadState();
  s.entries[localId] = entry;
  s.queue.push({ op: 'create', localId, payload: { ...payload } });
  saveState(s);
  return entry;
}

// Update a time entry by id. For a local (unsynced) shift, the patch is folded into its queued
// create so it still syncs as one record. For a server entry, sends the update; on no signal it
// queues an update op keyed by the real id.
export async function updateEntry(id, patch) {
  const s = loadState();
  if (s.entries[id]) {
    s.entries[id] = { ...s.entries[id], ...patch };
    const createOp = s.queue.find(o => o.op === 'create' && o.localId === id);
    if (createOp) createOp.payload = { ...createOp.payload, ...patch };
    saveState(s);
    return s.entries[id];
  }
  if (navigator.onLine) {
    try {
      return await base44.entities.TimeEntry.update(id, patch);
    } catch { /* queue below */ }
  }
  s.queue.push({ op: 'update', entityId: id, patch: { ...patch } });
  saveState(s);
  return { id, ...patch };
}

let flushing = false;

// Replay the queue to the server, in order. Safe to call repeatedly; a no-op when offline or empty.
// Returns { synced, remaining }.
export async function flushQueue() {
  if (flushing || !navigator.onLine) return { synced: 0, remaining: loadState().queue.length };
  flushing = true;
  try {
    const s = loadState();
    const idMap = {}; // localId -> real server id (for any update that references a local shift)
    const remaining = [];
    let synced = 0;
    for (const op of s.queue) {
      try {
        if (op.op === 'create') {
          const created = await base44.entities.TimeEntry.create(op.payload);
          if (created?.id) idMap[op.localId] = created.id;
          delete s.entries[op.localId];
          synced++;
        } else if (op.op === 'update') {
          const target = op.entityId?.startsWith?.('local-') ? idMap[op.entityId] : op.entityId;
          if (!target) { remaining.push(op); continue; }
          await base44.entities.TimeEntry.update(target, op.patch);
          synced++;
        }
      } catch {
        remaining.push(op); // keep it; try again on the next flush
      }
    }
    s.queue = remaining;
    saveState(s);
    return { synced, remaining: remaining.length };
  } finally {
    flushing = false;
  }
}
