// Role-based permission helpers

export const ROLES = {
  OWNER: 'owner',
  COO: 'coo',
  SITE_MANAGER: 'site_manager',
  CREW_MEMBER: 'crew_member',
  CLIENT: 'client',
};

export const ROLE_LABELS = {
  owner: 'Owner',
  coo: 'Chief of Operations',
  site_manager: 'Site Manager',
  crew_member: 'Crew Member',
  client: 'Client',
};

// Can view all projects (not just assigned)
export const canViewAllProjects = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO;

// Treat legacy 'admin' role as owner
const isAdmin = (user) => user?.role === 'admin';

// Can create/delete projects
export const canManageProjects = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO;

// Can manage users (add/remove/change roles)
export const canManageUsers = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO;

// Can view the Users page
export const canViewUsersPage = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO;

// Can create/delete tasks
export const canManageTasks = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER ||
  user?.role === ROLES.COO ||
  user?.role === ROLES.SITE_MANAGER;

// Can mark tasks complete
export const canCompleteTasks = (user) => !!user;

// Can assign tasks to crew
export const canAssignTasks = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER ||
  user?.role === ROLES.COO ||
  user?.role === ROLES.SITE_MANAGER;

// Can add materials
export const canAddMaterials = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER ||
  user?.role === ROLES.COO ||
  user?.role === ROLES.SITE_MANAGER;

// Can change material status (site manager can mark delivered)
export const canUpdateMaterialStatus = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER ||
  user?.role === ROLES.COO ||
  user?.role === ROLES.SITE_MANAGER;

// Can delete materials
export const canDeleteMaterials = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO;

// Can edit existing tasks
export const canEditTasks = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO || user?.role === ROLES.SITE_MANAGER;

// Can view materials dashboard (site managers excluded, they use project page)
export const canViewMaterialsDashboard = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO;

// Can edit existing material requests
export const canEditMaterials = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO || user?.role === ROLES.SITE_MANAGER;

// Can manage templates
export const canManageTemplates = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO;

// Can use Fix It feature
export const canFixIt = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO || user?.role === ROLES.SITE_MANAGER;

// Can review / accept / decline client requests (COO + Owner only)
export const canReviewClientRequests = (user) =>
  isAdmin(user) || user?.role === ROLES.OWNER || user?.role === ROLES.COO;

// Is a client user (portal-only access)
export const isClient = (user) => user?.role === ROLES.CLIENT;

// Can view the Client Portal (only clients)
export const canViewClientPortal = (user) => user?.role === ROLES.CLIENT;

// Check if a user can access a specific project
export const canAccessProject = (user, projectId) => {
  if (!user) return false;
  if (isAdmin(user) || canViewAllProjects(user)) return true;
  return (user.assigned_project_ids || []).includes(projectId);
};

// Get allowed material statuses per role
export const getAllowedMaterialStatuses = (user) => {
  if (!user) return [];
  if (user.role === ROLES.OWNER || user.role === ROLES.COO) {
    return ['needed', 'ordered', 'delivered'];
  }
  if (user.role === ROLES.SITE_MANAGER) {
    return ['needed', 'ordered', 'delivered'];
  }
  return [];
};