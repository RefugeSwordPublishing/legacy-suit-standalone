import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SPREADSHEET_ID = '1nhoVEUMilvwLdlcJd0kgrKd9HK9K4cWFkIsUNVikvGo';
const TAB_NAME = 'Contractor Payments';
const TZ = 'America/Chicago';

function fmtDateTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('en-US', {
    timeZone: TZ,
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { bidSubmissionId } = payload;
    if (!bidSubmissionId) {
      return Response.json({ error: 'bidSubmissionId required' }, { status: 400 });
    }

    // Fetch submission, bid request, and change orders
    const submission = await base44.asServiceRole.entities.BidSubmission.get(bidSubmissionId);
    const bidRequest = await base44.asServiceRole.entities.BidRequest.get(submission.bid_request_id);
    const changeOrders = await base44.asServiceRole.entities.ChangeOrder.filter({ bid_submission_id: bidSubmissionId });

    const approvedChangeOrders = changeOrders.filter(co => co.status === 'approved');
    const changeOrderTotal = approvedChangeOrders.reduce((sum, co) => sum + (co.amount || 0), 0);
    const total = (submission.bid_amount || 0) + changeOrderTotal;

    const row = [
      bidRequest.project_name || '',
      submission.sub_contractor_name || '',
      fmtDateTime(submission.paid_at),
      submission.bid_amount || 0,
      changeOrderTotal,
      total,
    ];

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Ensure tab exists
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const meta = await metaRes.json();
    const sheets = meta.sheets || [];
    const existingSheet = sheets.find(s => s.properties.title === TAB_NAME);

    if (!existingSheet) {
      // Create the tab with headers
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB_NAME } } }] })
      });

      // Write header row
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TAB_NAME + '!A1')}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            values: [['Project Name', 'Contractor', 'Date & Time Paid', 'Bid Amount', 'Change Orders', 'Total']]
          })
        }
      );
    }

    // Append the payment row
    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(TAB_NAME + '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [row] })
      }
    );

    if (!appendRes.ok) {
      const err = await appendRes.text();
      return Response.json({ error: 'Failed to append row', details: err }, { status: 500 });
    }

    return Response.json({ success: true, row });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});