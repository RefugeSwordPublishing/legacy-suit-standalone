// Canonical read for who a task is assigned to. Tasks now carry an `assignees` array (multi-assign);
// older tasks only have the single `assigned_to` string. Everything that displays or filters by
// assignment should go through this so new + legacy tasks behave the same.
export function taskAssignees(task) {
  if (task?.assignees && task.assignees.length) return task.assignees.filter(Boolean);
  if (task?.assigned_to && task.assigned_to !== 'unassigned') return [task.assigned_to];
  return [];
}

// Full name for a user profile, matching how assignees are stored (first+last, else email).
export function userFullName(u) {
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.email || '';
}
