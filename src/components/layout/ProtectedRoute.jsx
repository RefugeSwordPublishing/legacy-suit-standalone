import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useFeaturePermission } from '@/lib/usePermissions';
import { useCurrentUser } from '@/lib/UserContext';
import { useToast } from '@/components/ui/use-toast';
import ProGate from '@/components/shared/ProGate';

// Guards a route by (optionally) billing tier and permission:
//   tier        - 'field' | 'pro'. A tenant without that tier gets an upgrade prompt instead.
//   featureKey  - permission feature. Users without read access are redirected home.
export default function ProtectedRoute({ featureKey, tier, proFeature, children }) {
  const { canRead } = useFeaturePermission(featureKey);
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();

  const blockedByPlan =
    (tier === 'pro' && currentUser?.is_pro === false) ||
    (tier === 'field' && currentUser?.has_field === false);

  useEffect(() => {
    if (!blockedByPlan && featureKey && !canRead) {
      toast({ title: "You don't have permission to access this page.", variant: 'destructive' });
    }
  }, [canRead, blockedByPlan, featureKey]);

  // Plan gate first: a tenant without the tier can't reach the feature regardless of role.
  if (blockedByPlan) return <ProGate tier={tier} feature={proFeature || 'This feature'}>{null}</ProGate>;

  if (featureKey && !canRead) return <Navigate to="/" replace />;

  return children;
}
