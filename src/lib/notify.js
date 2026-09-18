import { toast as showToast } from '@/components/ui/use-toast';

// sonner-style calls (toast.success / toast.error) routed to the toaster the app actually mounts.
// A few screens imported toast from 'sonner', whose <Toaster> is never rendered, so their success
// and error messages never appeared.
export const toast = {
  success: (title, opts = {}) => showToast({ title, description: opts.description }),
  error: (title, opts = {}) => showToast({ title, description: opts.description, variant: 'destructive' }),
  message: (title, opts = {}) => showToast({ title, description: opts.description }),
};
