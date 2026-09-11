import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, Package, CheckSquare, ClipboardList, MessageSquare, Inbox, Moon, Sun, Monitor } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import SettingsBack from '@/components/shared/SettingsBack';
import PushNotificationsCard from '@/components/settings/PushNotificationsCard';
import {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
} from '@/lib/useBrowserNotifications';

const isOwnerAdminCOO = (user) => ['owner', 'admin', 'coo'].includes(user?.role);
const isSiteManager = (user) => user?.role === 'site_manager';
const isCrewMember = (user) => user?.role === 'crew_member';

const NOTIFICATION_OPTIONS = [
  {
    key: 'notify_client_request',
    label: 'Client Request Updates',
    description: 'Get notified when a client submits or updates a request.',
    icon: Inbox,
    roles: (user) => isOwnerAdminCOO(user),
  },
  {
    key: 'notify_material_added',
    label: 'Bulk Material Request Added',
    description: 'Get notified when a bulk material request is submitted.',
    icon: Package,
    roles: (user) => isOwnerAdminCOO(user),
  },
  {
    key: 'notify_new_message',
    label: 'New Messages',
    description: 'Get notified when you receive a new chat message.',
    icon: MessageSquare,
    roles: () => true,
  },
  {
    key: 'notify_task_assigned',
    label: 'Task or Fix-It Assigned to Me',
    description: 'Get notified when a task or Fix-It is assigned to you.',
    icon: CheckSquare,
    roles: () => true,
  },
  {
    key: 'notify_project_assigned',
    label: 'New Project Assigned to Me',
    description: 'Get notified when you are assigned to a new project.',
    icon: ClipboardList,
    roles: (user) => isSiteManager(user),
  },
];

export default function NotificationSettings() {
  const { currentUser, refreshUser } = useCurrentUser();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState({});
  const [saving, setSaving] = useState(null);
  const [browserPermission, setBrowserPermission] = useState(getBrowserNotificationPermission());
  const [browserEnabled, setBrowserEnabled] = useState(() => {
    return localStorage.getItem('browser_notifications_enabled') === 'true';
  });

  useEffect(() => {
    if (!currentUser) return;
    const initial = {};
    NOTIFICATION_OPTIONS.forEach(opt => {
      initial[opt.key] = currentUser[opt.key] !== false;
    });
    setPrefs(initial);
  }, [currentUser]);

  const handleBrowserToggle = async (val) => {
    if (val) {
      const perm = await requestBrowserNotificationPermission();
      setBrowserPermission(perm);
      if (perm === 'granted') {
        localStorage.setItem('browser_notifications_enabled', 'true');
        setBrowserEnabled(true);
        toast({ title: 'Browser notifications enabled' });
      } else {
        toast({ title: 'Permission denied', description: 'Please allow notifications in your browser settings.' });
      }
    } else {
      localStorage.setItem('browser_notifications_enabled', 'false');
      setBrowserEnabled(false);
      toast({ title: 'Browser notifications disabled' });
    }
  };

  const handleToggle = async (key, value) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    setSaving(key);
    try {
      await base44.auth.updateMe({ [key]: value });
      await refreshUser();
      toast({ title: 'Preference saved' });
    } catch (e) {
      setPrefs(prev => ({ ...prev, [key]: !value })); // revert
      toast({ title: 'Could not save preference', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const visibleOptions = NOTIFICATION_OPTIONS.filter(opt => opt.roles(currentUser));

  const roleLabel = () => {
    const r = currentUser?.role;
    if (r === 'owner') return 'Owner';
    if (r === 'admin') return 'Admin';
    if (r === 'coo') return 'COO';
    if (r === 'site_manager') return 'Site Manager';
    if (r === 'crew_member') return 'Crew Member';
    return '';
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <SettingsBack />
      <div className="flex items-center gap-3">
        <Bell className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Notification Settings</h1>
          <p className="text-sm text-muted-foreground">
            Preferences for your role: <span className="font-medium text-foreground">{roleLabel()}</span>
          </p>
        </div>
      </div>

      {/* Theme preference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Choose your preferred color theme.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {currentUser?.theme === 'dark' ? <Moon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" /> : <Sun className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />}
              <div>
                <Label className="text-sm font-medium">Dark Mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Switch between light and dark theme.</p>
              </div>
            </div>
            <Switch
              checked={currentUser?.theme === 'dark'}
              onCheckedChange={async (val) => {
                const newTheme = val ? 'dark' : 'light';
                try {
                  await base44.auth.updateMe({ theme: newTheme });
                  await refreshUser();
                } catch (e) {
                  toast({ title: 'Could not change theme', description: e?.message || String(e), variant: 'destructive' });
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {isBrowserNotificationSupported() && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Browser Notifications</CardTitle>
            <CardDescription>Receive system-level notifications even when the app is in the background.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Monitor className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <Label className="text-sm font-medium">Enable Browser Notifications</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {browserPermission === 'denied'
                      ? 'Notifications are blocked. Please enable them in your browser settings.'
                      : 'Show OS-level alerts for your enabled notification types.'}
                  </p>
                </div>
              </div>
              <Switch
                checked={browserEnabled && browserPermission === 'granted'}
                onCheckedChange={handleBrowserToggle}
                disabled={browserPermission === 'denied'}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <PushNotificationsCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">In-App Notifications</CardTitle>
          <CardDescription>Choose which events trigger a notification for you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {visibleOptions.length === 0 && (
            <p className="text-sm text-muted-foreground">No notification options available for your role.</p>
          )}
          {visibleOptions.map(opt => {
            const Icon = opt.icon;
            return (
              <div key={opt.key} className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <Label className="text-sm font-medium">{opt.label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                </div>
                <Switch
                  checked={!!prefs[opt.key]}
                  onCheckedChange={(val) => handleToggle(opt.key, val)}
                  disabled={saving === opt.key}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}