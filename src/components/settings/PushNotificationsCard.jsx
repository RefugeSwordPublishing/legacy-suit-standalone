import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Smartphone } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  pushSupported, permissionState, isSubscribed,
  subscribeToPush, unsubscribeFromPush, sendTestPush,
} from '@/lib/push';

// Per-device push opt-in. Lives in Settings next to Browser Notifications.
export default function PushNotificationsCard() {
  const { toast } = useToast();
  const [supported] = useState(pushSupported());
  const [perm, setPerm] = useState(permissionState());
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (supported) isSubscribed().then(setOn).catch(() => {});
  }, [supported]);

  const enable = async () => {
    setBusy(true);
    try {
      await subscribeToPush();
      setOn(true);
      setPerm(permissionState());
      toast({ title: 'Notifications enabled on this device' });
    } catch (e) {
      toast({ title: 'Could not enable notifications', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const disable = async () => {
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
                    ? 'Notifications are blocked in your browser settings. Enable them for this site, then try again.'
                    : 'Delivers alerts to this phone or computer.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {on ? (
                <>
                  <Button size="sm" variant="outline" onClick={test} disabled={busy}>Send test</Button>
                  <Button size="sm" variant="ghost" onClick={disable} disabled={busy}>Turn off</Button>
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
