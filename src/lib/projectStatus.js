// Project lifecycle: planning, active, on_hold, completed, archived.
//
// Completed still takes costs (a late supplier invoice, a warranty callback). Archived is closed
// out: it leaves every picker used to create new records, but stays in reports, history and search.

export const isArchived = (p) => p?.status === 'archived';

// Finished, for screens that only show work in progress.
export const isClosed = (p) => p?.status === 'completed' || p?.status === 'archived';

// Projects offered when creating or editing a record. keepId keeps an archived project that is
// already selected, so editing an old record does not silently drop its project.
export const selectableProjects = (projects = [], keepId) =>
  projects.filter((p) => !isArchived(p) || (keepId && p.id === keepId));
