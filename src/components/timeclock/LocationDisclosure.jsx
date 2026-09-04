import { MapPin } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Google Play requires a prominent, in-app disclosure BEFORE the runtime location prompt, telling
// the person what is collected, why, and who can see it. It is not optional for an app that shares
// a worker's location with their employer, and the store listing's data safety answers have to
// match what this says.
//
// Declining still clocks you in, without a location, exactly as an offline clock-in already does.
export default function LocationDisclosure({ open, onAllow, onDecline }) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className="rounded-lg bg-accent/15 p-2 text-accent"><MapPin className="w-5 h-5" /></span>
            Before we use your location
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                GuildWright records where you are at the moment you clock in and clock out, to confirm
                the shift happened at the job site.
              </p>
              <ul className="space-y-1.5 list-disc pl-5">
                <li>Your company's owners and administrators can see it on your timecard.</li>
                <li>It is collected only when you clock in or out, not while you work.</li>
                <li>It is never collected in the background or when the app is closed.</li>
              </ul>
              <p className="text-muted-foreground">
                You can continue without it. Your shift still records, just without a location, which
                is what happens when you clock in with no signal.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDecline}>Not now</AlertDialogCancel>
          <AlertDialogAction onClick={onAllow}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
