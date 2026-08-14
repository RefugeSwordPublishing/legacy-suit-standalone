import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { Bell, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function MyNotifications() {
  const { currentUser } = useCurrentUser();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    if (!currentUser) return;
    setLoading(true);
    const items = await base44.entities.Notification.filter(
      { user_id: currentUser.id },
      '-created_date',
      50
    );
    setNotifications(items);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
    if (!currentUser) return;
    const unsub = base44.entities.Notification.subscribe(() => fetchNotifications());
    return unsub;
  }, [currentUser]);

  const markRead = async (n) => {
    if (!n.read) {
      await base44.entities.Notification.update(n.id, { read: true });
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    // Daily goal notifications go to tasks page (crew members can't access project detail)
    if (n.type === 'daily_goal' || n.type === 'task_assigned') {
      navigate('/tasks?view=mine');
    } else if (n.project_id) {
      navigate(`/projects/${n.project_id}`);
    }
  };

  const markAllRead = async () => {
    const unreadItems = notifications.filter(n => !n.read);
    await Promise.all(unreadItems.map(n => base44.entities.Notification.update(n.id, { read: true })));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">My Notifications</h1>
          {unread > 0 && (
            <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">
              {unread} unread
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => markRead(n)}
              className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors hover:bg-muted/50 ${
                !n.read ? 'bg-yellow-50 border-yellow-200' : 'bg-card border-border'
              }`}
            >
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.read ? 'bg-yellow-400' : 'bg-transparent'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                {n.project_name && (
                  <p className="text-xs text-accent font-medium mt-1">{n.project_name}</p>
                )}
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {format(new Date(n.created_date), 'MMM d, h:mm a')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}