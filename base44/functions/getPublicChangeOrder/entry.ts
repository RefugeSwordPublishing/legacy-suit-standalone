import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { changeOrderId } = await req.json();

    if (!changeOrderId) {
      return Response.json({ error: 'changeOrderId required' }, { status: 400 });
    }

    const changeOrder = await base44.asServiceRole.entities.ClientChangeOrder.get(changeOrderId);
    if (!changeOrder) {
      return Response.json({ error: 'Change order not found' }, { status: 404 });
    }

    return Response.json({ changeOrder });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});