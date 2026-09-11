import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const requestData = body?.data || {};
    const projectId = requestData.project_id;
    const title = requestData.title || 'New Request';
    const submittedBy = requestData.submitted_by || 'A client';

    // Fetch the project name
    let projectName = '';
    if (projectId) {
      const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
      projectName = projects?.[0]?.name || '';
    }

    // Notify all users with owner, coo, or admin roles
    const allProfiles = await base44.asServiceRole.entities.UserProfile.list();
    const targets = allProfiles.filter(p => ['owner', 'coo', 'admin'].includes(p.role));

    await Promise.all(targets.map(profile =>
      base44.asServiceRole.entities.Notification.create({
        user_id: profile.user_id,
        type: 'material_added', // reusing closest type
        title: 'New Client Request',
        message: `${submittedBy} submitted: "${title}"`,
        project_id: projectId,
        project_name: projectName,
        read: false,
      })
    ));

    return Response.json({ success: true, notified: targets.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});