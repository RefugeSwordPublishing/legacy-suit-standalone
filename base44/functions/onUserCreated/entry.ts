import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const userData = body?.data || {};
    const userId = body?.event?.entity_id;

    if (!userId) {
      return Response.json({ error: 'No entity_id in event' }, { status: 400 });
    }

    // Check if a UserProfile already exists for this user
    const existing = await base44.asServiceRole.entities.UserProfile.filter({ user_id: userId });
    if (existing && existing.length > 0) {
      return Response.json({ message: 'UserProfile already exists', id: existing[0].id });
    }

    const profile = await base44.asServiceRole.entities.UserProfile.create({
      user_id: userId,
      email: userData.email || '',
      full_name: userData.full_name || [userData.first_name, userData.last_name].filter(Boolean).join(' ') || '',
      first_name: userData.first_name || '',
      last_name: userData.last_name || '',
      role: userData.role || 'crew_member',
      assigned_project_ids: userData.assigned_project_ids || [],
      notify_task_assigned: userData.notify_task_assigned || false,
    });

    return Response.json({ success: true, profile_id: profile.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});