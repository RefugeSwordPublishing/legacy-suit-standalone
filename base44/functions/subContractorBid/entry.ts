import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Resend } from 'npm:resend@4.0.0';

function getResend() {
  return new Resend(Deno.env.get('RESEND_API_KEY'));
}

async function sendEmail({ to, subject, html }) {
  const resend = getResend();
  await resend.emails.send({
    from: 'Legacy Renovations <noreply@app.legacyrenovationssgf.com>',
    to,
    subject,
    html,
  });
}

Deno.serve(async (req) => {
  try {
    const APP_URL = Deno.env.get('APP_PUBLIC_URL') || req.headers.get('origin') || '';
    const base44 = createClientFromRequest(req);
    const userClient = base44; // user-scoped client for RLS-restricted writes
    const payload = await req.json();

    // ── MODE: send_bid_request ──────────────────────────────────────────────
    if (payload.mode === 'send_bid_request') {
      const { bidRequestId } = payload;
      const br = await base44.asServiceRole.entities.BidRequest.get(bidRequestId);
      if (!br) return Response.json({ error: 'Bid request not found' }, { status: 404 });

      const subIds = br.sub_contractor_ids || [];
      const subs = await base44.asServiceRole.entities.SubContractor.list();
      const invited = subs.filter(s => subIds.includes(s.id));

      const scopeHtml = (br.scope_of_work || [])
        .map(item => `<li style="margin-bottom:6px;">☐ ${item.title}</li>`)
        .join('');

      const photoHtml = (br.photo_urls || [])
        .map(url => `<img src="${url}" style="max-width:100%;max-height:300px;margin:8px 0;border-radius:8px;" />`)
        .join('');

      const fileHtml = (br.file_urls || []).map((url, i) => {
        const name = (br.file_names || [])[i] || `File ${i + 1}`;
        return `<a href="${url}" style="display:block;margin:4px 0;color:#30381E;">${name}</a>`;
      }).join('');

      for (const sub of invited) {
        const bidLink = `${APP_URL}/submit-bid?bidRequestId=${br.id}&subId=${sub.id}`;
        const html = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;">
            <h2 style="color:#30381E;">Bid Request: ${br.title}</h2>
            <p>Hello ${sub.business_name || sub.contact_name},</p>
            <p>You have been invited to submit a bid for the following project:</p>
            <table style="width:100%;border-collapse:collapse;margin:12px 0;">
              <tr><td style="padding:6px 0;color:#666;width:140px;">Project</td><td><strong>${br.project_name || ''}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#666;">Address</td><td>${br.project_address || 'TBD'}</td></tr>
            </table>
            ${br.description ? `<p style="background:#f5f5f0;padding:12px;border-radius:8px;">${br.description}</p>` : ''}
            ${scopeHtml ? `<h3 style="color:#30381E;margin-top:20px;">Scope of Work</h3><ul style="padding-left:20px;">${scopeHtml}</ul>` : ''}
            ${photoHtml ? `<h3 style="color:#30381E;margin-top:20px;">Project Photos</h3>${photoHtml}` : ''}
            ${fileHtml ? `<h3 style="color:#30381E;margin-top:20px;">Attached Documents</h3>${fileHtml}` : ''}
            <div style="margin-top:28px;text-align:center;">
              <a href="${bidLink}" style="background:#30381E;color:#E7E3CA;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Submit Your Bid</a>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#999;">Legacy Renovations · Site Management</p>
          </div>`;

        await sendEmail({
          to: sub.email,
          subject: `Bid Request: ${br.title}, Legacy Renovations`,
          html,
        });
      }

      return Response.json({ success: true, sent: invited.length });
    }

    // ── MODE: send_estimate_request ────────────────────────────────────────
    if (payload.mode === 'send_estimate_request') {
      const { bidRequestId } = payload;
      const br = await base44.asServiceRole.entities.BidRequest.get(bidRequestId);
      if (!br) return Response.json({ error: 'Bid request not found' }, { status: 404 });

      const subIds = br.sub_contractor_ids || [];
      const subs = await base44.asServiceRole.entities.SubContractor.list();
      const invited = subs.filter(s => subIds.includes(s.id));

      const scopeHtml = (br.scope_of_work || [])
        .map(item => `<li style="margin-bottom:6px;">✓ ${item.title}</li>`)
        .join('');

      const photoHtml = (br.photo_urls || [])
        .map(url => `<img src="${url}" style="max-width:100%;max-height:300px;margin:8px 0;border-radius:8px;" />`)
        .join('');

      const fileHtml = (br.file_urls || []).map((url, i) => {
        const name = (br.file_names || [])[i] || `File ${i + 1}`;
        return `<a href="${url}" style="display:block;margin:4px 0;color:#30381E;">${name}</a>`;
      }).join('');

      const windowHtml = (br.eta_window_start && br.eta_window_end)
        ? `<p style="margin-top:12px;"><strong>Scheduling Window:</strong> ${br.eta_window_start} - ${br.eta_window_end}<br/><em style="font-size:13px;color:#666;">Please select your start date within this window when you approve.</em></p>`
        : '';

      for (const sub of invited) {
        const approveLink = `${APP_URL}/submit-bid?bidRequestId=${br.id}&subId=${sub.id}&mode=approve_estimate`;
        const html = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;">
            <h2 style="color:#30381E;">Estimate for Approval: ${br.title}</h2>
            <p>Hello ${sub.business_name || sub.contact_name},</p>
            <p>Legacy Renovations has prepared an estimate for the following work and is requesting your approval.</p>
            <table style="width:100%;border-collapse:collapse;margin:12px 0;">
              <tr><td style="padding:6px 0;color:#666;width:140px;">Project</td><td><strong>${br.project_name || ''}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#666;">Address</td><td>${br.project_address || 'TBD'}</td></tr>
            </table>
            ${br.description ? `<p style="background:#f5f5f0;padding:12px;border-radius:8px;">${br.description}</p>` : ''}
            ${scopeHtml ? `<h3 style="color:#30381E;margin-top:20px;">Scope of Work</h3><ul style="padding-left:20px;">${scopeHtml}</ul>` : ''}
            ${br.budget ? `
              <div style="margin:20px 0;padding:16px 20px;background:#f0f4ec;border-left:4px solid #30381E;border-radius:6px;">
                <p style="margin:0;font-size:13px;color:#555;text-transform:uppercase;letter-spacing:0.05em;">Predetermined Estimate Amount</p>
                <p style="margin:4px 0 0;font-size:28px;font-weight:bold;color:#30381E;">$${Number(br.budget).toLocaleString()}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#777;">This amount has been set by Legacy Renovations and is not negotiable.</p>
              </div>` : ''}
            ${windowHtml}
            ${photoHtml ? `<h3 style="color:#30381E;margin-top:20px;">Project Photos</h3>${photoHtml}` : ''}
            ${fileHtml ? `<h3 style="color:#30381E;margin-top:20px;">Attached Documents</h3>${fileHtml}` : ''}
            <div style="margin-top:28px;text-align:center;">
              <a href="${approveLink}" style="background:#30381E;color:#E7E3CA;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Review &amp; Approve Estimate</a>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#999;">Legacy Renovations · Site Management</p>
          </div>`;

        await sendEmail({
          to: sub.email,
          subject: `Estimate for Your Approval: ${br.title}, Legacy Renovations`,
          html,
        });
      }

      return Response.json({ success: true, sent: invited.length });
    }

    // ── MODE: submit_bid (public, no auth required) ──────────────────────
    if (payload.mode === 'submit_bid') {
      const { bidRequestId, subContractorId, bidAmount, estimatedStartDate, estimatedEndDate, notes } = payload;

      const subs = await base44.asServiceRole.entities.SubContractor.list();
      const sub = subs.find(s => s.id === subContractorId);
      if (!sub) return Response.json({ error: 'Sub-contractor not found' }, { status: 404 });

      const existing = await base44.asServiceRole.entities.BidSubmission.filter({ bid_request_id: bidRequestId, sub_contractor_id: subContractorId });
      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.BidSubmission.update(existing[0].id, {
          bid_amount: bidAmount,
          estimated_start_date: estimatedStartDate,
          estimated_end_date: estimatedEndDate,
          notes,
          status: 'submitted',
        });
      } else {
        await base44.asServiceRole.entities.BidSubmission.create({
          bid_request_id: bidRequestId,
          sub_contractor_id: subContractorId,
          sub_contractor_name: sub.business_name || sub.contact_name,
          sub_contractor_email: sub.email,
          bid_amount: bidAmount,
          estimated_start_date: estimatedStartDate,
          estimated_end_date: estimatedEndDate,
          notes,
          status: 'submitted',
        });
      }

      await base44.asServiceRole.entities.BidRequest.update(bidRequestId, { status: 'reviewing' });

      const br = await base44.asServiceRole.entities.BidRequest.get(bidRequestId);
      const allProfiles = await base44.asServiceRole.entities.UserProfile.list();
      const admins = allProfiles.filter(p => ['owner', 'admin'].includes(p.role));
      for (const admin of admins) {
        if (!admin.email) continue;
        await sendEmail({
          to: admin.email,
          subject: `New Bid Received: ${br?.title || 'Bid Request'}`,
          html: `<div style="font-family:sans-serif;"><h2>New Bid Submitted</h2><p><strong>${sub.business_name || sub.contact_name}</strong> has submitted a bid for <strong>${br?.title || 'a bid request'}</strong> on project ${br?.project_name || ''}.</p><p>Amount: <strong>$${bidAmount?.toLocaleString() || 'N/A'}</strong></p><p>Estimated Start: ${estimatedStartDate || 'TBD'}</p><p>Log in to Legacy Renovations to review and approve bids.</p></div>`,
        });
      }

      return Response.json({ success: true });
    }

    // ── MODE: approve_estimate (public, contractor approves a preset estimate) ─
    if (payload.mode === 'approve_estimate') {
      const { bidRequestId, subContractorId, estimatedStartDate, notes } = payload;

      const subs = await base44.asServiceRole.entities.SubContractor.list();
      const sub = subs.find(s => s.id === subContractorId);
      if (!sub) return Response.json({ error: 'Sub-contractor not found' }, { status: 404 });

      const br = await base44.asServiceRole.entities.BidRequest.get(bidRequestId);
      if (!br) return Response.json({ error: 'Bid request not found' }, { status: 404 });

      // Create or update the submission using the preset budget as the bid amount
      const existing = await base44.asServiceRole.entities.BidSubmission.filter({ bid_request_id: bidRequestId, sub_contractor_id: subContractorId });
      let submissionId;
      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.BidSubmission.update(existing[0].id, {
          bid_amount: br.budget,
          estimated_start_date: estimatedStartDate,
          estimated_end_date: estimatedStartDate, // same as start for estimate approval
          notes: notes || '',
          status: 'approved',
        });
        submissionId = existing[0].id;
      } else {
        const created = await base44.asServiceRole.entities.BidSubmission.create({
          bid_request_id: bidRequestId,
          sub_contractor_id: subContractorId,
          sub_contractor_name: sub.business_name || sub.contact_name,
          sub_contractor_email: sub.email,
          bid_amount: br.budget,
          estimated_start_date: estimatedStartDate,
          estimated_end_date: estimatedStartDate,
          notes: notes || '',
          status: 'approved',
        });
        submissionId = created.id;
      }

      // Award the bid request
      await base44.asServiceRole.entities.BidRequest.update(bidRequestId, {
        status: 'awarded',
        awarded_to_id: subContractorId,
        awarded_to_name: sub.business_name || sub.contact_name,
      });

      // Auto-create task
      if (br.project_id) {
        const scopeSubtasks = (br.scope_of_work || []).map((s, i) => ({
          id: String(i), title: s.title, completed: false, assigned_to: '',
        }));
        await base44.asServiceRole.entities.Task.create({
          project_id: br.project_id,
          title: br.title,
          notes: br.description || '',
          priority: 'high',
          status: 'pending',
          is_sub_contractor_task: true,
          sub_contractor_id: subContractorId,
          sub_contractor_name: sub.business_name || sub.contact_name,
          bid_request_id: bidRequestId,
          eta_start: estimatedStartDate || null,
          eta_end: estimatedStartDate || null,
          subtasks: scopeSubtasks,
          photo_urls: br.photo_urls || [],
        });
      }

      // Notify admins
      const allProfiles = await base44.asServiceRole.entities.UserProfile.list();
      const admins = allProfiles.filter(p => ['owner', 'admin'].includes(p.role));
      for (const admin of admins) {
        if (!admin.email) continue;
        await sendEmail({
          to: admin.email,
          subject: `Estimate Approved: ${br.title}`,
          html: `<div style="font-family:sans-serif;"><h2 style="color:#30381E;">Estimate Approved</h2><p><strong>${sub.business_name || sub.contact_name}</strong> has approved the estimate for <strong>${br.title}</strong>.</p><p>Amount: <strong>$${Number(br.budget).toLocaleString()}</strong></p><p>Proposed Start Date: ${estimatedStartDate || 'TBD'}</p><p>Log in to Legacy Renovations to view the details.</p></div>`,
        });
      }

      return Response.json({ success: true });
    }

    // ── MODE: approve_bid ─────────────────────────────────────────────────
    if (payload.mode === 'approve_bid') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const profiles = await base44.asServiceRole.entities.UserProfile.filter({ user_id: user.id });
      const profile = profiles[0];
      if (!profile || !['owner', 'admin', 'coo'].includes(profile.role)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const { bidSubmissionId, bidRequestId } = payload;

      const allBids = await base44.asServiceRole.entities.BidSubmission.filter({ bid_request_id: bidRequestId });
      for (const bid of allBids) {
        await base44.asServiceRole.entities.BidSubmission.update(bid.id, {
          status: bid.id === bidSubmissionId ? 'approved' : 'declined',
        });
      }

      const winningBid = allBids.find(b => b.id === bidSubmissionId);
      const br = await base44.asServiceRole.entities.BidRequest.get(bidRequestId);

      await base44.asServiceRole.entities.BidRequest.update(bidRequestId, {
        status: 'awarded',
        awarded_to_id: winningBid?.sub_contractor_id,
        awarded_to_name: winningBid?.sub_contractor_name,
      });

      if (br?.project_id && winningBid) {
        const scopeSubtasks = (br.scope_of_work || []).map((s, i) => ({
          id: String(i), title: s.title, completed: false, assigned_to: '',
        }));
        await base44.asServiceRole.entities.Task.create({
          project_id: br.project_id,
          title: br.title,
          notes: br.description || '',
          priority: 'high',
          status: 'pending',
          is_sub_contractor_task: true,
          sub_contractor_id: winningBid.sub_contractor_id,
          sub_contractor_name: winningBid.sub_contractor_name,
          bid_request_id: bidRequestId,
          eta_start: winningBid.estimated_start_date || null,
          eta_end: winningBid.estimated_end_date || null,
          subtasks: scopeSubtasks,
          photo_urls: br.photo_urls || [],
        });
      }

      if (winningBid?.sub_contractor_email) {
        const scheduleLink = `${APP_URL}/submit-bid?bidRequestId=${bidRequestId}&subId=${winningBid.sub_contractor_id}&mode=schedule`;
        await sendEmail({
          to: winningBid.sub_contractor_email,
          subject: `Your Bid Has Been Approved, ${br?.title || 'Bid Request'}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><h2 style="color:#30381E;">Congratulations! Your Bid Was Approved</h2><p>Hello ${winningBid.sub_contractor_name},</p><p>Your bid for <strong>${br?.title || 'the project'}</strong> at <strong>${br?.project_address || ''}</strong> has been approved.</p><p>Your bid amount: <strong>$${winningBid.bid_amount?.toLocaleString() || 'N/A'}</strong></p><p>Please click below to confirm your schedule:</p><div style="margin:24px 0;text-align:center;"><a href="${scheduleLink}" style="background:#30381E;color:#E7E3CA;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Confirm Work Schedule</a></div><p style="font-size:12px;color:#999;">Legacy Renovations · Site Management</p></div>`,
        });
      }

      return Response.json({ success: true });
    }

    // ── MODE: send_fixit_email ────────────────────────────────────────────
    if (payload.mode === 'send_fixit_email') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      const { subContractorId, taskTitle, notes, imageUrl, projectName, projectAddress } = payload;
      const subs = await base44.asServiceRole.entities.SubContractor.list();
      const sub = subs.find(s => s.id === subContractorId);
      if (!sub) return Response.json({ error: 'Sub-contractor not found' }, { status: 404 });

      const photoHtml = imageUrl ? `<img src="${imageUrl}" style="max-width:100%;max-height:300px;border-radius:8px;margin:12px 0;" />` : '';
      const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><h2 style="color:#ef4444;">Fix It Notice</h2><p>Hello ${sub.business_name || sub.contact_name},</p><p>The following issue has been identified on your completed scope of work for <strong>${projectName}</strong>${projectAddress ? ` at ${projectAddress}` : ''}:</p><h3 style="margin-top:16px;">${taskTitle}</h3>${notes ? `<p style="background:#fff3f3;border-left:4px solid #ef4444;padding:12px;border-radius:4px;">${notes}</p>` : ''}${photoHtml}<p style="margin-top:20px;">Please review and coordinate a time to address this issue at your earliest convenience.</p><p style="font-size:12px;color:#999;margin-top:24px;">Legacy Renovations · Site Management</p></div>`;

      await sendEmail({
        to: sub.email,
        subject: `Fix It Notice: ${taskTitle}, ${projectName}`,
        html,
      });

      return Response.json({ success: true });
    }

    // ── MODE: cancel_awarded_bid ──────────────────────────────────────────
    if (payload.mode === 'cancel_awarded_bid') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const profiles = await base44.asServiceRole.entities.UserProfile.filter({ user_id: user.id });
      const profile = profiles[0];
      if (!profile || !['owner', 'admin'].includes(profile.role)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const { bidRequestId } = payload;
      const br = await base44.asServiceRole.entities.BidRequest.get(bidRequestId);
      if (!br) return Response.json({ error: 'Bid request not found' }, { status: 404 });

      // Find the awarded subcontractor
      const subs = await base44.asServiceRole.entities.SubContractor.list();
      const sub = subs.find(s => s.id === br.awarded_to_id);

      // Delete tasks linked to this bid request
      const tasks = await base44.asServiceRole.entities.Task.filter({ bid_request_id: bidRequestId });
      for (const task of tasks) {
        await base44.asServiceRole.entities.Task.delete(task.id);
      }

      // Delete schedule entries linked to these tasks or to this subcontractor on this project
      const allScheduleEntries = await base44.asServiceRole.entities.CrewScheduleEntry.list();
      const taskIds = tasks.map(t => t.id);
      // Also delete any crew schedule entries for the subcontractor on this project
      // (CrewScheduleEntry doesn't have bid_request_id, so we clean up by project + subcontractor match via user_id)
      // We delete tasks above; schedule entries tied to the project and this sub's user_id
      // Since sub-contractors are not users, just delete tasks. Nothing more to do for schedule entries.

      // Mark bid request as cancelled
      await base44.asServiceRole.entities.BidRequest.update(bidRequestId, { status: 'cancelled' });

      // Email the subcontractor
      if (sub?.email) {
        await sendEmail({
          to: sub.email,
          subject: `Work Cancellation Notice: ${br.title}, Legacy Renovations`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;">
            <h2 style="color:#30381E;">Work Cancellation Notice</h2>
            <p>Hello ${sub.business_name || sub.contact_name},</p>
            <p>We are writing to inform you that the previously approved work for the following project is no longer needed:</p>
            <table style="width:100%;border-collapse:collapse;margin:12px 0;">
              <tr><td style="padding:6px 0;color:#666;width:140px;">Project</td><td><strong>${br.project_name || ''}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#666;">Work Title</td><td><strong>${br.title}</strong></td></tr>
              ${br.project_address ? `<tr><td style="padding:6px 0;color:#666;">Address</td><td>${br.project_address}</td></tr>` : ''}
            </table>
            <p>Please disregard any previous scheduling or work arrangements related to this scope. We apologize for any inconvenience this may cause.</p>
            <p>If you have any questions, please don't hesitate to reach out.</p>
            <p style="margin-top:24px;font-size:12px;color:#999;">Legacy Renovations · Site Management</p>
          </div>`,
        });
      }

      return Response.json({ success: true });
    }

    // ── MODE: notify_bid_updated ──────────────────────────────────────────
    if (payload.mode === 'notify_bid_updated') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      const { bidRequestId } = payload;
      const br = await base44.asServiceRole.entities.BidRequest.get(bidRequestId);
      if (!br) return Response.json({ error: 'Bid request not found' }, { status: 404 });

      const subIds = br.sub_contractor_ids || [];
      const subs = await base44.asServiceRole.entities.SubContractor.list();
      const invited = subs.filter(s => subIds.includes(s.id));

      const scopeHtml = (br.scope_of_work || [])
        .map(item => `<li style="margin-bottom:6px;">${item.title}</li>`)
        .join('');

      const photoHtml = (br.photo_urls || [])
        .map(url => `<img src="${url}" style="max-width:100%;max-height:300px;margin:8px 0;border-radius:8px;" />`)
        .join('');

      const fileHtml = (br.file_urls || []).map((url, i) => {
        const name = (br.file_names || [])[i] || `File ${i + 1}`;
        return `<a href="${url}" style="display:block;margin:4px 0;color:#30381E;">${name}</a>`;
      }).join('');

      const isEstimate = br.request_type === 'estimate';

      for (const sub of invited) {
        const actionLink = isEstimate
          ? `${APP_URL}/submit-bid?bidRequestId=${br.id}&subId=${sub.id}&mode=approve_estimate`
          : `${APP_URL}/submit-bid?bidRequestId=${br.id}&subId=${sub.id}`;

        const html = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;">
            <div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
              <strong style="color:#92400e;">⚠ Updated: ${isEstimate ? 'Estimate' : 'Bid Request'}</strong>
            </div>
            <h2 style="color:#30381E;">${br.title}</h2>
            <p>Hello ${sub.business_name || sub.contact_name},</p>
            <p>Legacy Renovations has updated the ${isEstimate ? 'estimate' : 'bid request'} you were previously sent. Please review the latest details below.</p>
            <table style="width:100%;border-collapse:collapse;margin:12px 0;">
              <tr><td style="padding:6px 0;color:#666;width:140px;">Project</td><td><strong>${br.project_name || ''}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#666;">Address</td><td>${br.project_address || 'TBD'}</td></tr>
            </table>
            ${br.description ? `<p style="background:#f5f5f0;padding:12px;border-radius:8px;">${br.description}</p>` : ''}
            ${scopeHtml ? `<h3 style="color:#30381E;margin-top:20px;">Scope of Work</h3><ul style="padding-left:20px;">${scopeHtml}</ul>` : ''}
            ${br.budget && isEstimate ? `
              <div style="margin:20px 0;padding:16px 20px;background:#f0f4ec;border-left:4px solid #30381E;border-radius:6px;">
                <p style="margin:0;font-size:13px;color:#555;">Estimate Amount</p>
                <p style="margin:4px 0 0;font-size:28px;font-weight:bold;color:#30381E;">$${Number(br.budget).toLocaleString()}</p>
              </div>` : ''}
            ${photoHtml ? `<h3 style="color:#30381E;margin-top:20px;">Project Photos</h3>${photoHtml}` : ''}
            ${fileHtml ? `<h3 style="color:#30381E;margin-top:20px;">Attached Documents</h3>${fileHtml}` : ''}
            <div style="margin-top:28px;text-align:center;">
              <a href="${actionLink}" style="background:#30381E;color:#E7E3CA;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
                ${isEstimate ? 'Review Updated Estimate' : 'View Updated Bid Request'}
              </a>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#999;">Legacy Renovations · Site Management</p>
          </div>`;

        await sendEmail({
          to: sub.email,
          subject: `Updated: ${br.title}, Legacy Renovations`,
          html,
        });
      }

      return Response.json({ success: true, notified: invited.length });
    }

    // ── MODE: decline_estimate (public, contractor declines) ────────────
    if (payload.mode === 'decline_estimate') {
      const { bidRequestId, subContractorId, reason } = payload;

      const br = await base44.asServiceRole.entities.BidRequest.get(bidRequestId);
      if (!br) return Response.json({ error: 'Bid request not found' }, { status: 404 });

      const subs = await base44.asServiceRole.entities.SubContractor.list();
      const sub = subs.find(s => s.id === subContractorId);
      if (!sub) return Response.json({ error: 'Sub-contractor not found' }, { status: 404 });

      // Notify all admins/owners
      const allProfiles = await base44.asServiceRole.entities.UserProfile.list();
      const admins = allProfiles.filter(p => ['owner', 'admin'].includes(p.role));
      for (const admin of admins) {
        if (!admin.email) continue;
        await sendEmail({
          to: admin.email,
          subject: `Estimate Declined: ${br.title}, Legacy Renovations`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;">
              <div style="background:#fff0f0;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
                <strong style="color:#b91c1c;">⚠ Estimate Declined</strong>
              </div>
              <h2 style="color:#30381E;">${br.title}</h2>
              <p><strong>${sub.business_name || sub.contact_name}</strong> has declined the estimate for project <strong>${br.project_name || ''}</strong>.</p>
              ${reason ? `
                <div style="margin-top:16px;">
                  <p style="color:#666;font-size:13px;margin-bottom:6px;">Reason provided:</p>
                  <p style="background:#f5f5f0;padding:12px;border-radius:8px;border-left:3px solid #ef4444;">${reason}</p>
                </div>` : '<p style="color:#666;font-size:13px;margin-top:12px;">No reason was provided.</p>'}
              <p style="margin-top:20px;">You may want to edit the estimate and resend, or assign a different contractor.</p>
              <p style="margin-top:24px;font-size:12px;color:#999;">Legacy Renovations · Site Management</p>
            </div>`,
        });
      }

      return Response.json({ success: true });
    }

    // ── MODE: get_bid_data (public) ───────────────────────────────────────
    if (payload.mode === 'get_bid_data') {
      const { bidRequestId, subId } = payload;
      let br = null;
      try { br = await base44.asServiceRole.entities.BidRequest.get(bidRequestId); } catch (_) { br = null; }
      const subs = await base44.asServiceRole.entities.SubContractor.list();
      const sub = subs.find(s => s.id === subId) || null;
      const existingBids = br ? await base44.asServiceRole.entities.BidSubmission.filter({ bid_request_id: bidRequestId, sub_contractor_id: subId }) : [];
      return Response.json({ bidRequest: br, sub, existingBid: existingBids[0] || null });
    }

    // ── MODE: confirm_schedule ────────────────────────────────────────────
    if (payload.mode === 'confirm_schedule') {
      const { bidRequestId, subContractorId, estimatedStartDate, estimatedEndDate, notes } = payload;
      const existing = await base44.asServiceRole.entities.BidSubmission.filter({ bid_request_id: bidRequestId, sub_contractor_id: subContractorId });
      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.BidSubmission.update(existing[0].id, {
          estimated_start_date: estimatedStartDate,
          estimated_end_date: estimatedEndDate,
          notes: notes || existing[0].notes,
        });
      }
      return Response.json({ success: true });
    }

    // ── MODE: send_invoice ────────────────────────────────────────────────
    if (payload.mode === 'send_invoice') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      const { invoiceId, invoicePayload } = payload;
      const inv = invoicePayload;
      if (!inv?.client_email) return Response.json({ error: 'No client email' }, { status: 400 });

      const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const lineItemRows = (inv.line_items || []).map(item => {
        const total = (item.quantity || 0) * (item.unit_cost || 0) * (1 + (item.markup_pct || 0) / 100);
        return `<tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 8px;font-weight:500;">${item.name || ''}</td>
          <td style="padding:10px 8px;color:#666;font-size:13px;">${item.description || ''}</td>
          <td style="padding:10px 8px;text-align:right;white-space:nowrap;">${fmt(total)}</td>
        </tr>`;
      }).join('');

      const html = `
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#222;">
          <div style="background:#30381E;padding:24px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:16px;">
            <img src="https://media.base44.com/images/public/69d4420172cf85cc1afabd4c/0574d129b_Light_OliveBack_Square.png" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" />
            <div>
              <h1 style="margin:0;color:#E7E3CA;font-size:22px;">Invoice</h1>
              <p style="margin:2px 0 0;color:#E7E3CA;opacity:0.7;font-size:13px;">Legacy Renovations</p>
            </div>
            <div style="margin-left:auto;text-align:right;">
              <p style="margin:0;color:#E7E3CA;font-size:18px;font-weight:bold;">${inv.invoice_number || ''}</p>
              ${inv.issue_date ? `<p style="margin:2px 0 0;color:#E7E3CA;opacity:0.7;font-size:12px;">Issued: ${inv.issue_date}</p>` : ''}
              ${inv.due_date ? `<p style="margin:2px 0 0;color:#E7E3CA;opacity:0.7;font-size:12px;">Due: ${inv.due_date}</p>` : ''}
            </div>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 28px;">
            <p>Hello ${inv.client_name},</p>
            <p>Please find your invoice for <strong>${inv.project_name}</strong> below.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;">
              <thead>
                <tr style="background:#f5f5f0;">
                  <th style="text-align:left;padding:10px 8px;font-size:13px;color:#666;">Item</th>
                  <th style="text-align:left;padding:10px 8px;font-size:13px;color:#666;">Description</th>
                  <th style="text-align:right;padding:10px 8px;font-size:13px;color:#666;">Total</th>
                </tr>
              </thead>
              <tbody>${lineItemRows}</tbody>
            </table>
            <div style="text-align:right;margin-top:12px;padding-top:12px;border-top:2px solid #30381E;">
              <p style="font-size:20px;font-weight:bold;color:#30381E;margin:0;">Total: ${fmt(inv.grand_total)}</p>
            </div>
            ${inv.notes ? `<p style="margin-top:20px;background:#f5f5f0;padding:12px;border-radius:8px;font-size:13px;">${inv.notes}</p>` : ''}
            ${inv.quickbooks_invoice_url ? `
              <div style="margin-top:28px;text-align:center;">
                <a href="${inv.quickbooks_invoice_url}" style="background:#30381E;color:#E7E3CA;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Pay Invoice</a>
              </div>` : ''}
            <p style="margin-top:24px;font-size:12px;color:#999;">Legacy Renovations · Site Management</p>
          </div>
        </div>`;

      await sendEmail({
        to: inv.client_email,
        subject: `Invoice ${inv.invoice_number || ''}: ${inv.project_name}, Legacy Renovations`,
        html,
      });

      return Response.json({ success: true });
    }

    // ── MODE: send_estimate_to_client ─────────────────────────────────────
    if (payload.mode === 'send_estimate_to_client') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      const { estimateId, clientEmail: clientEmailFromPayload } = payload;
      const estimate = await base44.asServiceRole.entities.Estimate.get(estimateId);
      if (!estimate) return Response.json({ error: 'Estimate not found' }, { status: 404 });

      const clientEmail = clientEmailFromPayload || estimate.client_email;
      if (!clientEmail) return Response.json({ error: 'No client email on file for this client.' }, { status: 400 });

      const estimateLink = `${APP_URL}/client-estimate?id=${estimateId}`;
      const grandTotal = `$${Number(estimate.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

      const html = `
        <div style="font-family:'Georgia',serif;max-width:640px;margin:0 auto;color:#3d3d1e;background:#faf8f4;padding:0;">
          <!-- Header -->
          <div style="background:#faf8f4;border-bottom:2px solid #c8c09a;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td><img src="https://media.base44.com/images/public/69d4420172cf85cc1afabd4c/5a0ac84cb_LegacyRennovations_PrimaryLogo_Dark.png" style="height:40px;display:block;" /></td>
              <td align="right" style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8a8a52;font-family:sans-serif;">Estimate</td>
            </tr></table>
          </div>
          <!-- Body -->
          <div style="background:#faf8f4;padding:32px;border-left:1px solid #ede8dc;border-right:1px solid #ede8dc;">
            <p style="font-size:16px;margin:0 0 16px;color:#3d3d1e;">Hello ${estimate.client_name || 'Valued Client'},</p>
            <p style="font-size:14px;color:#5a5a2a;line-height:1.7;margin:0 0 24px;">
              Legacy Renovations has prepared a detailed estimate for <strong>${estimate.title}</strong>${estimate.project_name ? ` on project <strong>${estimate.project_name}</strong>` : ''}. Please review the full scope of work and total below, then use the link to accept electronically.
            </p>
            <!-- Total box -->
            <div style="background:#f7f4ee;border:1.5px solid #c8c09a;border-radius:4px;padding:20px 24px;margin-bottom:28px;">
              <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8a8a52;margin-bottom:6px;font-family:sans-serif;">Total Estimate</div>
              <div style="font-family:'Georgia',serif;font-size:30px;font-weight:bold;color:#3d3d1e;">${grandTotal}</div>
            </div>
            <!-- CTA button -->
            <div style="text-align:center;margin:28px 0;">
              <a href="${estimateLink}" style="display:inline-block;background:#3d3d1e;color:#f7f4ee;padding:15px 48px;border-radius:2px;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;white-space:nowrap;">ACCEPT ESTIMATE</a>
            </div>
            <p style="font-size:12px;color:#8a8a52;line-height:1.6;margin-top:24px;">
              This estimate is valid for 30 days. If you have any questions, please don't hesitate to reach out.<br/>
              <a href="https://legacyrenovationssgf.com" style="color:#8a8a52;">legacyrenovationssgf.com</a>
            </p>
          </div>
          <!-- Footer -->
          <div style="background:#faf8f4;border:1px solid #ede8dc;border-top:none;text-align:center;padding:16px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8a8a52;font-family:sans-serif;">
            Legacy Renovations &nbsp;·&nbsp; Springfield, MO &nbsp;·&nbsp; Est. 2015
          </div>
        </div>`;

      await sendEmail({
        to: clientEmail,
        subject: `Your Estimate: ${estimate.title}, Legacy Renovations`,
        html,
      });

      await base44.asServiceRole.entities.Estimate.update(estimateId, { status: 'sent' });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown mode' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});