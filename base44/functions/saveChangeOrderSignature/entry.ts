import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { changeOrderId, signedBy, signedAt } = await req.json();

    if (!changeOrderId || !signedBy || !signedAt) {
      return Response.json({ error: 'changeOrderId, signedBy, and signedAt are required' }, { status: 400 });
    }

    // Update the change order
    const changeOrder = await base44.asServiceRole.entities.ClientChangeOrder.get(changeOrderId);
    await base44.asServiceRole.entities.ClientChangeOrder.update(changeOrderId, {
      signed_by: signedBy,
      signed_at: signedAt,
      status: 'approved',
    });

    // Find owner or admin to notify
    try {
      const userProfiles = await base44.asServiceRole.entities.UserProfile.list();
      const ownerProfile = userProfiles.find(p => p.role === 'owner') || userProfiles.find(p => p.role === 'admin');
      if (ownerProfile) {
        const clientName = changeOrder?.client_name || signedBy;
        const changeOrderNumber = changeOrder?.change_order_number || changeOrderId.slice(0, 8);
        const projectName = changeOrder?.project_name || 'the project';

        await base44.asServiceRole.entities.Notification.create({
          user_id: ownerProfile.user_id,
          type: 'change_order_accepted',
          title: 'Change Order Accepted',
          message: `${clientName} has accepted change order ${changeOrderNumber} for ${projectName}`,
          project_name: projectName,
          read: false,
        });
      }
    } catch (notifErr) {
      console.error('Failed to create notification:', notifErr.message);
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});