import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';

// Feature areas and their default permissions per role
export const FEATURES = [
  { key: 'projects',         label: 'Projects' },
  { key: 'estimates',        label: 'Estimates' },
  { key: 'invoices',         label: 'Invoices' },
  { key: 'clients',          label: 'Clients' },
  { key: 'tasks',            label: 'Tasks' },
  { key: 'materials',        label: 'Materials' },
  { key: 'expenses',         label: 'Expenses' },
  { key: 'timecards',        label: 'Timecards' },
  { key: 'time_off',         label: 'Time Off' },
  { key: 'subcontractors',   label: 'Subcontractors' },
  { key: 'reports',          label: 'Reports' },
  { key: 'phase_approvals',  label: 'Phase Approvals' },
  { key: 'chat',             label: 'Chat' },
  { key: 'client_requests',  label: 'Client Requests' },
  { key: 'user_management',  label: 'User Management' },
];

// Roles configurable in the Permissions matrix. Owner + admin are always full and not shown.
export const PERMISSION_ROLES = ['coo', 'site_manager', 'crew_member'];

const ALL_FEATURES_FULL = Object.fromEntries(
  ['projects','estimates','invoices','clients','tasks','materials','expenses','timecards','time_off','subcontractors','reports','phase_approvals','chat','client_requests','user_management']
    .map(k => [k, { can_read: true, can_write: true }])
);

// Defaults when no record saved yet
const ROLE_DEFAULTS = {
  admin: { can_read: true, can_write: true },
  coo: ALL_FEATURES_FULL,
  site_manager: {
    projects: { can_read: true, can_write: true },
    estimates: { can_read: false, can_write: false },
    invoices: { can_read: false, can_write: false },
    clients: { can_read: true, can_write: false },
    tasks: { can_read: true, can_write: true },
    materials: { can_read: true, can_write: true },
    expenses: { can_read: false, can_write: false },
    timecards: { can_read: true, can_write: true },
    time_off: { can_read: true, can_write: false },
    subcontractors: { can_read: false, can_write: false },
    reports: { can_read: false, can_write: false },
    phase_approvals: { can_read: true, can_write: true },
    chat: { can_read: true, can_write: true },
    client_requests: { can_read: false, can_write: false },
    user_management: { can_read: false, can_write: false },
  },
  crew_member: {
    projects: { can_read: true, can_write: false },
    estimates: { can_read: false, can_write: false },
    invoices: { can_read: false, can_write: false },
    clients: { can_read: false, can_write: false },
    tasks: { can_read: true, can_write: true },
    materials: { can_read: false, can_write: false },
    expenses: { can_read: false, can_write: false },
    timecards: { can_read: true, can_write: true },
    time_off: { can_read: true, can_write: true },
    subcontractors: { can_read: false, can_write: false },
    reports: { can_read: false, can_write: false },
    phase_approvals: { can_read: false, can_write: false },
    chat: { can_read: true, can_write: true },
    client_requests: { can_read: false, can_write: false },
    user_management: { can_read: false, can_write: false },
  },
};

// Build a lookup map from saved DB records: { role_feature: { can_read, can_write } }
function buildPermissionMap(records) {
  const map = {};
  for (const r of records) {
    map[`${r.role}_${r.feature}`] = { can_read: r.can_read, can_write: r.can_write };
  }
  return map;
}

// Get effective permission for a role+feature
export function getPermission(map, role, feature) {
  const key = `${role}_${feature}`;
  if (map[key]) return map[key];
  // Fall back to defaults
  if (role === 'admin') return ROLE_DEFAULTS.admin;
  return ROLE_DEFAULTS[role]?.[feature] || { can_read: false, can_write: false };
}

// Hook: returns { canRead, canWrite } for the current user's role + a feature key
export function useFeaturePermission(featureKey) {
  const { currentUser } = useCurrentUser();
  const { map, isLoading } = useAllPermissions();

  // Owner and admin always get full access, never blocked. COO is configurable via the matrix.
  const role = currentUser?.role;
  if (!role || role === 'owner' || role === 'admin') {
    return { canRead: true, canWrite: true };
  }

  // While loading, don't block anything
  if (isLoading) return { canRead: true, canWrite: true };

  const perm = getPermission(map, role, featureKey);
  return { canRead: perm.can_read, canWrite: perm.can_write };
}

// Hook: returns the full map of all permissions (used by Permissions page)
export function useAllPermissions() {
  const { data: records = [], isLoading, refetch } = useQuery({
    queryKey: ['permissionSettings'],
    queryFn: () => base44.entities.PermissionSettings.list(),
    staleTime: 10000,
  });

  const map = buildPermissionMap(records);
  return { records, map, isLoading, refetch };
}

export { ROLE_DEFAULTS, buildPermissionMap };