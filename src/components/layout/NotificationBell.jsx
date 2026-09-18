import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { Bell } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { sendBrowserNotification } from '@/lib/useBrowserNotifications';

// Stable debounce: returns a function that delays execution and cancels previous pending calls
function useDebounced(fn, delay) {
  const timerRef = useRef(null);
  const fnRef = useRef(fn);
  fnRef.current = fn; // always latest fn without re-creating debounced wrapper

  const debounced = useRef((...args) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delay);
  });

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return debounced.current;
}

export function useUnreadCount() {
  const { currentUser } = useCurrentUser();
  const [unread, setUnread] = useState(0);

  const refresh = async (user) => {
    if (!user) return;
    const items = await base44.entities.Notification.filter({ user_id: user.id }, '-created_date', 50);
    setUnread(items.filter(n => !n.read).length);
  };

  const debouncedRefresh = useDebounced((user) => refresh(user), 8000);

  useEffect(() => {
    if (!currentUser) return;
    refresh(currentUser);
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type === 'create' && event.data?.user_id === currentUser.id && !event.data?.read) {
        setUnread(prev => prev + 1);
      } else {
        debouncedRefresh(currentUser);
      }
    });
    return unsub;
  }, [currentUser]);

  return unread;
}

export default function NotificationBell() {
  const { currentUser } = useCurrentUser();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const knownIdsRef = useRef(new Set());

  const unread = notifications.filter(n => !n.read).length;

  const fetchNotifications = async () => {
    if (!currentUser) return;
    const items = await base44.entities.Notification.filter(
      { user_id: currentUser.id },
      '-created_date',
      30
    );
    setNotifications(items);
    items.forEach(n => knownIdsRef.current.add(n.id));
  };

  const debouncedFetch = useDebounced(fetchNotifications, 8000);

  useEffect(() => {
    if (!currentUser) return;
    fetchNotifications();
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type === 'create' && event.data?.user_id === currentUser.id) {
        const n = event.data;
        if (!knownIdsRef.current.has(n.id)) {
          knownIdsRef.current.add(n.id);
          setNotifications(prev => [n, ...prev]);
          if (localStorage.getItem('browser_notifications_enabled') === 'true') {
            sendBrowserNotification(n.title, n.message);
          }
        }
      } else {
        debouncedFetch();
      }
    });
    return unsub;
  }, [currentUser]);

  const markRead = async (n) => {
    if (!n.read) {
      await base44.entities.Notification.update(n.id, { read: true });
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.project_id) {
      setOpen(false);
      navigate(`/projects/${n.project_id}`);
    }
  };

  const markAllRead = async () => {
    const unreadItems = notifications.filter(n => !n.read);
    await Promise.all(unreadItems.map(n => base44.entities.Notification.update(n.id, { read: true })));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  if (!currentUser) return null;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) fetchNotifications(); }}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50 transition-all">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[14px] h-[14px] bg-accent rounded-full flex items-center justify-center text-[9px] font-bold text-accent-foreground px-0.5">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b flex items-center justify-between">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground">
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No notifications yet</p>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => markRead(n)}
                className={`px-3 py-2.5 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors ${!n.read ? 'bg-accent/5' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />}
                  <div className={!n.read ? '' : 'ml-3.5'}>
                    <p className="text-xs font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                    {n.project_name && (
                      <p className="text-xs text-accent mt-0.5">{n.project_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {format(new Date(n.created_date), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}