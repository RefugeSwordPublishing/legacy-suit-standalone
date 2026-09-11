import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { estimateId, signedBy, signedAt } = await req.json();

    if (!estimateId || !signedBy || !signedAt) {
      return Response.json({ error: 'estimateId, signedBy, and signedAt are required' }, { status: 400 });
    }

    await base44.asServiceRole.entities.Estimate.update(estimateId, {
      signed_by: signedBy,
      signed_at: signedAt,
      status: 'approved',
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});