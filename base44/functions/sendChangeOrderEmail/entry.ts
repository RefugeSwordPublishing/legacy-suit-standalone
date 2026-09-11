import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Resend } from 'npm:resend@4.0.0';

const fmt = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PRIMARY_LOGO = "https://media.base44.com/images/public/69d4420172cf85cc1afabd4c/a958d994e_LegacyRennovations_PrimaryLogo_Light.png";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { changeOrderId } = await req.json();
    if (!changeOrderId) return Response.json({ error: 'changeOrderId required' }, { status: 400 });

    const co = await base44.asServiceRole.entities.ClientChangeOrder.get(changeOrderId);
    if (!co) return Response.json({ error: 'Change order not found' }, { status: 404 });

    // If no email stored on the CO, try looking up the linked client
    let clientEmail = co.client_email;
    if (!clientEmail && co.client_id) {
      const client = await base44.asServiceRole.entities.Client.get(co.client_id);
      clientEmail = client?.email || "";
      // Persist it back so future sends work without re-fetching
      if (clientEmail) {
        await base44.asServiceRole.entities.ClientChangeOrder.update(co.id, { client_email: clientEmail });
      }
    }
    if (!clientEmail) return Response.json({ error: 'No client email on file' }, { status: 400 });

    const appUrl = Deno.env.get("APP_PUBLIC_URL") || "https://app.base44.com";
    const signUrl = `${appUrl}/client-change-order/${co.id}`;

    const coNumber = co.change_order_number || co.id?.slice(-8).toUpperCase();
    const clientFirstName = (co.client_name || "").split(" ")[0] || "there";
    const original = co.original_estimate_total || 0;
    const changeAmt = co.change_order_total || 0;
    const newTotal = co.new_contract_total || (original + changeAmt);
    const changeSign = changeAmt >= 0 ? "+" : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Change Order ${coNumber}</title>
</head>
<body style="margin:0;padding:0;background:#e8e3d8;font-family:'Jost',Arial,sans-serif;color:#3d3d1e;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8e3d8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

        <!-- Logo header -->
        <tr>
          <td style="background:#faf8f4;border-bottom:1px solid #c8c09a;padding:22px 36px;border-radius:6px 6px 0 0;">
            <img src="${PRIMARY_LOGO}" alt="Legacy Renovations" style="height:44px;display:block;" />
          </td>
        </tr>

        <!-- Body card -->
        <tr>
          <td style="background:#faf8f4;padding:36px 36px 28px;">

            <!-- Title block -->
            <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8a8a52;">Change Order</p>
            <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;font-weight:400;letter-spacing:0.1em;text-transform:uppercase;color:#3d3d1e;">
              ${coNumber}
            </h1>
            ${co.project_name ? `<p style="margin:0 0 24px;font-size:13px;color:#8a8a52;">${co.project_name}</p>` : '<p style="margin:0 0 24px;"></p>'}

            <hr style="border:none;border-top:1px solid #c8c09a;margin:0 0 24px;" />

            <!-- Greeting -->
            <p style="font-size:15px;line-height:1.7;color:#3d3d1e;margin:0 0 20px;">
              Hi ${clientFirstName},
            </p>
            <p style="font-size:14px;line-height:1.8;color:#5a5a2a;margin:0 0 28px;">
              Please review the change order below. It outlines a modification to your existing project contract with Legacy Renovations. Once you've reviewed the details, please follow the link at the bottom to accept and sign electronically.
            </p>

            <!-- Contract summary box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #c8c09a;border-radius:6px;overflow:hidden;margin-bottom:28px;">
              <tr>
                <td style="background:#f7f4ee;padding:10px 20px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8a8a52;border-bottom:1px solid #c8c09a;">
                  Contract Summary
                </td>
              </tr>
              <tr>
                <td style="padding:0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr style="border-bottom:0.5px solid #ede8dc;">
                      <td style="padding:13px 20px;font-size:13px;color:#5a5a2a;">Original Contract Total</td>
                      <td style="padding:13px 20px;font-size:14px;color:#5a5a2a;text-align:right;">${fmt(original)}</td>
                    </tr>
                    <tr style="background:#fffbea;">
                      <td style="padding:13px 20px;font-size:13px;color:#3d3d1e;font-weight:600;">This Change Order</td>
                      <td style="padding:13px 20px;font-size:14px;color:#7a5a00;font-weight:700;text-align:right;">${changeSign}${fmt(changeAmt)}</td>
                    </tr>
                    <tr style="background:#f7f4ee;">
                      <td style="padding:15px 20px;font-family:Georgia,serif;font-size:16px;color:#3d3d1e;">New Contract Total</td>
                      <td style="padding:15px 20px;font-family:Georgia,serif;font-size:18px;color:#3d3d1e;font-weight:600;text-align:right;">${fmt(newTotal)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td align="center">
                  <a href="${signUrl}" style="display:inline-block;background:#3d3d1e;color:#f7f4ee;text-decoration:none;padding:14px 40px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;border-radius:2px;font-family:Arial,sans-serif;">
                    Review &amp; Sign Change Order
                  </a>
                </td>
              </tr>
            </table>

            <p style="font-size:12px;color:#8a8a52;line-height:1.6;margin:0 0 8px;">
              Or copy this link into your browser:
            </p>
            <p style="font-size:11px;color:#8a8a52;word-break:break-all;margin:0 0 28px;">
              <a href="${signUrl}" style="color:#5a5a2a;">${signUrl}</a>
            </p>

            <hr style="border:none;border-top:1px solid #c8c09a;margin:0 0 20px;" />

            <p style="font-size:12px;color:#8a8a52;line-height:1.7;margin:0;">
              This change order modifies only the scope and pricing described herein; all other terms of the original contract remain in full effect. Questions? Reply to this email or visit
              <a href="https://legacyrenovationssgf.com" style="color:#5a5a2a;">legacyrenovationssgf.com</a>.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#3d3d1e;padding:18px 36px;border-radius:0 0 6px 6px;text-align:center;">
            <p style="margin:0;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#c8c09a;line-height:2;">
              Legacy Renovations &nbsp;·&nbsp; Springfield, MO &nbsp;·&nbsp; Est. 2015<br/>
              <a href="https://legacyrenovationssgf.com" style="color:#c8c09a;">legacyrenovationssgf.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    await resend.emails.send({
      from: 'Legacy Renovations <noreply@legacyrenovationssgf.com>',
      to: clientEmail,
      subject: `Change Order ${coNumber}, Review & Sign | Legacy Renovations`,
      html,
    });

    // Update status to 'sent'
    await base44.asServiceRole.entities.ClientChangeOrder.update(co.id, { status: 'sent' });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});