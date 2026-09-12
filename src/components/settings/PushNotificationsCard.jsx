import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Smartphone } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  pushSupported, permissionState, isSubscribed,
  subscribeToPush, unsubscribeFromPush, sendTestPush,
  isNativePlatform, nativePermission, registerNativePush,
} from '@/lib/push';

// Per-device push opt-in. Lives in Settings next to Browser Notifications.
export default function PushNotificationsCard() {
  const { toast } = useToast();
  // The native app delivers push through Android itself, not the browser's push API, so the web
  // support check says "unsupported" there. Ask Capacitor instead when running natively.
  const native = isNativePlatform();
  const [supported] = useState(native || pushSupported());
  const [perm, setPerm] = useState(native ? 'prompt' : permissionState());
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (native) {
      nativePermission().then((p) => { setPerm(p); setOn(p === 'granted'); }).catch(() => {});
    } else if (supported) {
      isSubscribed().then(setOn).catch(() => {});
    }
  }, [native, supported]);

  const enable = async () => {
    setBusy(true);
    try {
      if (native) {
        const ok = await registerNativePush();
        const p = await nativePermission();
        setPerm(p);
        setOn(ok);
        toast(ok
          ? { title: 'Notifications enabled on this device' }
          : { title: 'Android blocked notifications', description: 'Turn them on for GuildWright in Android Settings, then try again.', variant: 'destructive' });
        return;
      }
      await subscribeToPush();
      setOn(true);
      setPerm(permissionState());
      toast({ title: 'Notifications enabled on this device' });
    } catch (e) {
      toast({ title: 'Could not enable notifications', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const disable = async () => {
    if (native) {
      toast({ title: 'Turn these off in Android', description: 'Android Settings, Apps, GuildWright, Notifications.' });
      return;
    }
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setOn(false);
      toast({ title: 'Notifications turned off for this device' });
    } catch (e) {
      toast({ title: 'Could not turn off notifications', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await sendTestPush();
      toast({ title: res?.sent ? 'Test sent' : 'No devices received it', description: res?.sent ? 'Check your device.' : 'Try enabling notifications again.' });
    } catch (e) {
      toast({ title: 'Test failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Push Notifications (this device)</CardTitle>
        <CardDescription>Get alerts for task assignments and team messages even when GuildWright is closed.</CardDescription>
      </CardHeader>
      <CardContent>
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            This device or browser does not support push notifications. On iPhone, add GuildWright to your Home Screen first, then re-open it here.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Smartphone className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <Label className="text-sm font-medium">{on ? 'Enabled on this device' : 'Enable on this device'}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {perm === 'denied'
                    ? (native
                      ? 'Notifications are blocked for GuildWright. Turn them on in Android Settings, Apps, GuildWright, then try again.'
                      : 'Notifications are blocked in your browser settings. Enable them for this site, then try again.')
                    : 'Delivers alerts to this phone or computer.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {on ? (
                <>
                  <Button size="sm" variant="outline" onClick={test} disabled={busy}>Send test</Button>
                  {!native && <Button size="sm" variant="ghost" onClick={disable} disabled={busy}>Turn off</Button>}
                </>
              ) : (
                <Button size="sm" onClick={enable} disabled={busy || perm === 'denied'}>Enable</Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
