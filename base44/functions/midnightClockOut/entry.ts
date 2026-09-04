import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get today's date in Central Time (America/Chicago)
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD

    // End of day = 11:59 PM Central
    const endOfDay = new Date(`${todayStr}T23:59:00`);
    // Treat as Central time by computing UTC offset
    const centralOffsetMs = new Date(`${todayStr}T23:59:00`).getTime() - new Date(
      new Date(`${todayStr}T23:59:00`).toLocaleString('en-US', { timeZone: 'America/Chicago' })
    ).getTime();
    const clockOutTime = new Date(endOfDay.getTime() - centralOffsetMs);

    // Find all entries still open today
    const activeEntries = await base44.asServiceRole.entities.TimeEntry.filter({ date: todayStr });
    const openEntries = activeEntries.filter(e => e.status === 'clocked_in' || e.status === 'on_break');

    if (openEntries.length === 0) {
      return Response.json({ message: 'No open entries to close', date: todayStr });
    }

    // Fetch admin/owner/coo profiles for notifications
    const allProfiles = await base44.asServiceRole.entities.UserProfile.filter({});
    const notifyProfiles = allProfiles.filter(p => ['owner', 'admin', 'coo'].includes(p.role));

    const results = [];

    for (const entry of openEntries) {
      const clockInTime = new Date(entry.clock_in);
      let totalMs = clockOutTime.getTime() - clockInTime.getTime();
      // Subtract break time if applicable
      if (entry.break_start && entry.break_end) {
        totalMs -= (new Date(entry.break_end).getTime() - new Date(entry.break_start).getTime());
      }
      const duration_minutes = Math.max(0, Math.round(totalMs / 60000));

      // Auto clock-out the entry
      await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
        clock_out: clockOutTime.toISOString(),
        duration_minutes,
        status: 'clocked_out',
        notes: (entry.notes ? entry.notes + ' ' : '') + '[Auto clocked out at 11:59 PM, requires correction]',
      });

      // Create a TimecardAdjustment flagged for review
      await base44.asServiceRole.entities.TimecardAdjustment.create({
        time_entry_id: entry.id,
        user_id: entry.user_id,
        user_name: entry.user_name,
        project_id: entry.project_id,
        project_name: entry.project_name,
        date: entry.date,
        original_clock_in: entry.clock_in,
        original_clock_out: clockOutTime.toISOString(),
        requested_clock_in: entry.clock_in,
        requested_clock_out: clockOutTime.toISOString(),
        reason: `AUTO: ${entry.user_name} did not clock out on ${entry.date}. System set clock-out to 11:59 PM. Please correct the actual clock-out time.`,
        status: 'pending',
        reviewed_by: '',
      });

      // Notify admin/owner/coo users
      for (const profile of notifyProfiles) {
        await base44.asServiceRole.entities.Notification.create({
          user_id: profile.user_id,
          type: 'timecard_auto_clockout',
          title: 'Auto Clock-Out: Correction Needed',
          message: `${entry.user_name} did not clock out from ${entry.project_name} on ${entry.date}. System set clock-out to 11:59 PM. Please review and correct.`,
          project_id: entry.project_id,
          project_name: entry.project_name,
          read: false,
        });
      }

      results.push({ user: entry.user_name, project: entry.project_name, date: entry.date });
    }

    return Response.json({
      success: true,
      processed: results.length,
      entries: results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});