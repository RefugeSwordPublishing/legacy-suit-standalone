import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { estimateId } = payload;

    if (!estimateId) {
      return Response.json({ error: 'estimateId required' }, { status: 400 });
    }

    const estimate = await base44.asServiceRole.entities.Estimate.get(estimateId);
    if (!estimate) {
      return Response.json({ error: 'Estimate not found' }, { status: 404 });
    }

    return Response.json({ estimate });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});