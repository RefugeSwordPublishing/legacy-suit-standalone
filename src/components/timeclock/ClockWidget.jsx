import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { useTheme } from '@/lib/ThemeContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, LogIn, LogOut, Coffee, MapPin, AlertCircle, CheckCircle2, UserCheck, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { sortByName } from '@/lib/naturalSort';
import { findOverlap } from '@/lib/timeEntries';
import { createEntry, updateEntry, flushQueue, getPendingEntries, subscribeOffline, pendingCount } from '@/lib/offlineTimeclock';

const GEOFENCE_RADIUS_M = 100;

function degreesToRad(deg) {
  return deg * (Math.PI / 180);
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = degreesToRad(lat2 - lat1);
  const dLng = degreesToRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(degreesToRad(lat1)) * Math.cos(degreesToRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=us&limit=1&addressdetails=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'ConstructionApp/1.0' } });
  const data = await res.json();
  if (data && data[0]) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display_name: data[0].display_name };
  }
  return null;
}

const GEOFENCE_METERS = 500; // a clock-in within this radius of the project site is "verified"

function metersBetween(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Shows WORKED time (break excluded). While on break the value freezes, so the number always
// reflects exactly what's being logged and reminds the worker they're paused.
function ElapsedTimer({ entry }) {
  const [elapsed, setElapsed] = useState('');
  const onBreak = entry?.status === 'on_break';
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const clockIn = new Date(entry.clock_in).getTime();
      let ms = now - clockIn;
      if (entry.break_start && entry.break_end) {
        ms -= (new Date(entry.break_end).getTime() - new Date(entry.break_start).getTime());
      } else if (entry.break_start && !entry.break_end) {
        // Currently on break: subtract the running break so the worked time holds steady.
        ms -= (now - new Date(entry.break_start).getTime());
      }
      const diff = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    };
    tick();
    // No need to keep ticking every second while paused on break.
    const interval = onBreak ? null : setInterval(tick, 1000);
    return () => { if (interval) clearInterval(interval); };
  }, [entry?.clock_in, entry?.break_start, entry?.break_end, entry?.status, onBreak]);
  return <span className={`font-mono text-lg font-semibold ${onBreak ? 'text-amber-600' : 'text-accent'}`}>{elapsed}{onBreak ? ' (paused)' : ''}</span>;
}

const HIGH_ROLES = ['owner', 'coo', 'admin', 'site_manager'];

export default function ClockWidget({ projects = [] }) {
  const { currentUser } = useCurrentUser();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [locationError, setLocationError] = useState('');
  const [locationOverrideCoords, setLocationOverrideCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualUserId, setManualUserId] = useState('');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isManager = HIGH_ROLES.includes(currentUser?.role);

  const { data: userProfiles = [] } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: () => base44.entities.UserProfile.list(),
    enabled: isManager,
  });

  const crewMembers = userProfiles.filter(u => ['crew_member', 'site_manager'].includes(u.role));

  // My active entry
  const { data: myEntries = [], refetch: refetchEntries } = useQuery({
    queryKey: ['time-entries-today', currentUser?.id],
    queryFn: () => base44.entities.TimeEntry.filter({ user_id: currentUser.id, date: todayStr }),
    enabled: !!currentUser?.id,
  });

  // Offline queue: shifts created with no signal live locally until they sync.
  const [pending, setPending] = useState(() => getPendingEntries());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingSync, setPendingSync] = useState(() => pendingCount());

  useEffect(() => {
    const onChange = () => {
      setPending(getPendingEntries());
      setPendingSync(pendingCount());
      setIsOnline(navigator.onLine);
    };
    return subscribeOffline(onChange);
  }, []);

  // Flush queued shifts on mount, reconnect, and refocus, then pull fresh data.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (!navigator.onLine) return;
      const { synced } = await flushQueue();
      if (cancelled) return;
      if (synced > 0) {
        await refetchEntries();
        queryClient.invalidateQueries({ queryKey: ['time-entries'] });
      }
    };
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    return () => { cancelled = true; window.removeEventListener('online', sync); window.removeEventListener('focus', sync); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const myPending = pending.filter(e => e.user_id === currentUser?.id && e.date === todayStr);
  const allMyEntries = [...myEntries, ...myPending];
  const activeEntry = allMyEntries.find(e => e.status === 'clocked_in' || e.status === 'on_break');

  // Cache the active project list so it's there on a cold offline start (pick a project + clock in
  // with no signal). Falls back to the cache only when the live list hasn't loaded (offline).
  const PROJECTS_CACHE = 'gw_cached_active_projects_v1';
  useEffect(() => {
    if (projects && projects.length) {
      try { localStorage.setItem(PROJECTS_CACHE, JSON.stringify(projects)); } catch { /* quota */ }
    }
  }, [projects]);
  const effectiveProjects = (projects && projects.length)
    ? projects
    : (() => { try { return JSON.parse(localStorage.getItem(PROJECTS_CACHE) || '[]'); } catch { return []; } })();

  // Resolves coords, or null if unavailable. Never rejects and never hangs: a hard fallback timer
  // guarantees it settles even when the platform (airplane mode, some webviews) fires no callback.
  const getGPS = (timeoutMs = 8000) => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    let settled = false;
    const finish = (val) => { if (!settled) { settled = true; resolve(val); } };
    try {
      navigator.geolocation.getCurrentPosition(
        pos => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => finish(null),
        { timeout: timeoutMs, maximumAge: 60000 }
      );
    } catch { finish(null); }
    setTimeout(() => finish(null), timeoutMs + 500);
  });

  const handleClockIn = async () => {
    setLocationError('');
    setLoading(true);
    const project = effectiveProjects.find(p => p.id === selectedProjectId);
    if (!project) { setLoading(false); return; }

    // Don't let a clock-in overlap time already logged today (an open shift or a manual entry
    // whose range covers now).
    const nowISO = new Date().toISOString();
    const conflict = findOverlap(allMyEntries, currentUser.id, nowISO, null, null);
    if (conflict) {
      const cin = conflict.clock_in ? format(new Date(conflict.clock_in), 'h:mm a') : '?';
      const cout = conflict.clock_out ? format(new Date(conflict.clock_out), 'h:mm a') : 'now (still clocked in)';
      setLocationError(`You already have time logged today from ${cin} to ${cout}. Clock out or edit that entry before clocking in again.`);
      setLoading(false);
      return;
    }

    let gpsCoords = null;
    let locationVerified = false;

    // Only check location when online. Offline (airplane mode / no signal) we skip it so the
    // clock-in is instant and never hangs waiting for a GPS fix; the shift syncs later.
    if (navigator.onLine) {
      gpsCoords = await getGPS();
      // Geofence: verify the clock-in is near the project site (only if the project has
      // coordinates). If the worker is well outside the radius, confirm before proceeding.
      if (gpsCoords && project.latitude != null && project.longitude != null) {
        const dist = metersBetween(gpsCoords, { lat: Number(project.latitude), lng: Number(project.longitude) });
        if (dist <= GEOFENCE_METERS) {
          locationVerified = true;
        } else {
          const miles = (dist / 1609.34).toFixed(2);
          if (!window.confirm(`You appear to be about ${miles} mi from ${project.name}. Clock in anyway?`)) {
            setLoading(false);
            return;
          }
        }
      }
    }

    const myName = currentUser?.full_name || currentUser?.email;
    await createEntry({
      user_id: currentUser.id,
      user_name: myName,
      user_role: currentUser.role,
      project_id: project.id,
      project_name: project.name,
      clock_in: new Date().toISOString(),
      date: todayStr,
      clock_in_lat: gpsCoords?.lat,
      clock_in_lng: gpsCoords?.lng,
      location_verified: locationVerified,
      status: 'clocked_in',
    });
    await refetchEntries();
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    setLoading(false);
  };

  const handleClockOut = async () => {
    setLoading(true);
    const now = new Date();
    const clockInTime = new Date(activeEntry.clock_in);
    let totalMs = now - clockInTime;
    if (activeEntry.break_start && activeEntry.break_end) {
      totalMs -= (new Date(activeEntry.break_end) - new Date(activeEntry.break_start));
    } else if (activeEntry.break_start && !activeEntry.break_end) {
      // still on break, end break now too
      totalMs -= (now - new Date(activeEntry.break_start));
    }
    const duration_minutes = Math.round(totalMs / 60000);
    const patch = {
      clock_out: now.toISOString(),
      break_end: activeEntry.status === 'on_break' ? now.toISOString() : activeEntry.break_end,
      duration_minutes,
      status: 'clocked_out',
    };
    await updateEntry(activeEntry.id, patch);
    // Optimistically reflect it locally so the UI updates even offline (a server entry updated
    // offline won't come back through a refetch until the queue flushes).
    queryClient.setQueryData(['time-entries-today', currentUser?.id], (old = []) => old.map(e => e.id === activeEntry.id ? { ...e, ...patch } : e));
    await refetchEntries();
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    setLoading(false);
  };

  const handleBreak = async () => {
    setLoading(true);
    if (activeEntry.status === 'on_break') {
      // End break
      const patch = { break_end: new Date().toISOString(), status: 'clocked_in' };
      await updateEntry(activeEntry.id, patch);
      queryClient.setQueryData(['time-entries-today', currentUser?.id], (old = []) => old.map(e => e.id === activeEntry.id ? { ...e, ...patch } : e));
    } else {
      // Start break (clear any prior break_end so the worked timer pauses cleanly)
      const patch = { break_start: new Date().toISOString(), break_end: null, status: 'on_break' };
      await updateEntry(activeEntry.id, patch);
      queryClient.setQueryData(['time-entries-today', currentUser?.id], (old = []) => old.map(e => e.id === activeEntry.id ? { ...e, ...patch } : e));
      // Auto clock out after 30 min
      setTimeout(async () => {
        const entries = await base44.entities.TimeEntry.filter({ user_id: currentUser.id, date: todayStr });
        const entry = entries.find(e => e.id === activeEntry.id && e.status === 'on_break');
        if (entry) {
          const now = new Date();
          const clockInTime = new Date(entry.clock_in);
          const breakStart = new Date(entry.break_start);
          let totalMs = now - clockInTime - (now - breakStart);
          await base44.entities.TimeEntry.update(entry.id, {
            break_end: now.toISOString(),
            clock_out: now.toISOString(),
            duration_minutes: Math.round(totalMs / 60000),
            status: 'clocked_out',
          });
          queryClient.invalidateQueries({ queryKey: ['time-entries-today'] });
          queryClient.invalidateQueries({ queryKey: ['time-entries'] });
        }
      }, 30 * 60 * 1000);
    }
    await refetchEntries();
    setLoading(false);
  };

  // Manual clock in/out for managers
  const handleManualClockIn = async () => {
    setLoading(true);
    const project = effectiveProjects.find(p => p.id === selectedProjectId);
    const targetUser = userProfiles.find(u => u.user_id === manualUserId);
    if (!project || !targetUser) { setLoading(false); return; }

    // Prevent duplicate: check if this user already has an active entry today (skip when offline).
    let alreadyActive = false;
    try {
      if (navigator.onLine) {
        const todayEntries = await base44.entities.TimeEntry.filter({ user_id: targetUser.user_id, date: todayStr });
        alreadyActive = todayEntries.some(e => e.status === 'clocked_in' || e.status === 'on_break');
      }
    } catch { /* offline; let it through and rely on sync */ }
    if (alreadyActive) {
      alert(`${targetUser.full_name} is already clocked in today.`);
      setLoading(false);
      return;
    }
    const myName = currentUser?.full_name || currentUser?.email;
    await createEntry({
      user_id: targetUser.user_id,
      user_name: targetUser.full_name,
      user_role: targetUser.role,
      project_id: project.id,
      project_name: project.name,
      clock_in: new Date().toISOString(),
      date: todayStr,
      location_verified: false,
      location_overridden: true,
      manually_clocked_by: myName,
      status: 'clocked_in',
    });
    queryClient.invalidateQueries({ queryKey: ['time-entries-today'] });
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    setLoading(false);
  };

  const handleClockInOverride = async () => {
    setLoading(true);
    const project = effectiveProjects.find(p => p.id === selectedProjectId);
    if (!project) { setLoading(false); return; }
    const myName = currentUser?.full_name || currentUser?.email;
    await createEntry({
      user_id: currentUser.id,
      user_name: myName,
      user_role: currentUser.role,
      project_id: project.id,
      project_name: project.name,
      clock_in: new Date().toISOString(),
      date: todayStr,
      clock_in_lat: locationOverrideCoords?.lat,
      clock_in_lng: locationOverrideCoords?.lng,
      location_verified: false,
      location_overridden: true,
      manually_clocked_by: myName,
      status: 'clocked_in',
    });
    setLocationError('');
    setLocationOverrideCoords(null);
    await refetchEntries();
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    setLoading(false);
  };

  const availableProjects = effectiveProjects.filter(p => p.status === 'active');

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">Time Clock</h2>
        {activeEntry && (
          <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
            activeEntry.status === 'on_break' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {activeEntry.status === 'on_break' ? 'On Break' : 'Clocked In'}
          </span>
        )}
      </div>

      {(!isOnline || pendingSync > 0) && (
        <div className="flex items-center gap-2 text-xs">
          {!isOnline && (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <WifiOff className="w-3.5 h-3.5" /> Offline — your time is saved and will sync
            </span>
          )}
          {pendingSync > 0 && (
            <span className="text-muted-foreground ml-auto">{pendingSync} shift{pendingSync === 1 ? '' : 's'} pending sync{isOnline ? '…' : ''}</span>
          )}
        </div>
      )}

      {activeEntry ? (
        <div className="space-y-3">
          <div className="bg-muted/40 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Working on: <span className="font-medium text-foreground">{activeEntry.project_name}</span></p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              In at {format(new Date(activeEntry.clock_in), 'h:mm a')} · Worked: <ElapsedTimer entry={activeEntry} />
            </div>
            {activeEntry.location_verified && (
              <div className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="w-3 h-3" /> Location verified
              </div>
            )}
            {activeEntry.location_overridden && (
              <div className="flex items-center gap-1 text-xs text-blue-600">
                <UserCheck className="w-3 h-3" /> Manually clocked by {activeEntry.manually_clocked_by}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleBreak}
              disabled={loading}
              variant="outline"
              className="flex-1 h-12"
            >
              <Coffee className="w-4 h-4 mr-1.5" />
              {activeEntry.status === 'on_break' ? 'End Break' : 'Take Break'}
            </Button>
            <Button
              onClick={handleClockOut}
              disabled={loading}
              className="flex-1 h-12 bg-red-500 hover:bg-red-600 text-white"
            >
              <LogOut className="w-4 h-4 mr-1.5" /> Clock Out
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select project..." />
            </SelectTrigger>
            <SelectContent>
              {sortByName(availableProjects).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {locationError && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{locationError}</span>
              </div>
              {isManager && locationOverrideCoords && (
                <button
                  onClick={handleClockInOverride}
                  disabled={loading}
                  className="w-full text-center text-xs text-blue-600 underline pt-1"
                >
                  Override & clock in anyway (manager)
                </button>
              )}
            </div>
          )}
          <Button
            onClick={handleClockIn}
            disabled={loading || !selectedProjectId}
            className="w-full h-14 text-base bg-accent text-accent-foreground hover:opacity-90"
          >
            <LogIn className="w-5 h-5 mr-1.5" />
            {loading ? (isOnline ? 'Checking location...' : 'Clocking in...') : 'Clock In'}
          </Button>

        </div>
      )}

      {/* Manager Manual Clock-In Section */}
      {isManager && (
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><UserCheck className="w-3 h-3" /> Manual Clock-In (Manager)</p>
          <Select value={manualUserId} onValueChange={setManualUserId}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select crew member..." />
            </SelectTrigger>
            <SelectContent>
              {crewMembers.map(u => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedProjectId && <p className="text-xs text-muted-foreground">Select a project above first</p>}
          <Button
            onClick={handleManualClockIn}
            disabled={loading || !manualUserId || !selectedProjectId}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <UserCheck className="w-3.5 h-3.5 mr-1" /> Clock In Employee
          </Button>
        </div>
      )}
    </div>
  );
}