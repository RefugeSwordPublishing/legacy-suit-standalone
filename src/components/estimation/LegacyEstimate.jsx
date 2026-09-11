import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useBranding } from '@/lib/useBranding';
import { docPalette } from '@/lib/docPalette';

const fmt = (n) => "$" + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function calcSectionTotal(section) {
  return (section.line_items || []).reduce((s, i) => s + (i.line_total || 0), 0);
}

function calcTotals(sections) {
  const allItems = (sections || []).flatMap(s => s.line_items || []);
  const subtotal = allItems.reduce((s, i) => s + (i.line_total || 0), 0);
  return subtotal;
}

const PAYMENT_SCHEDULE = [
  "25% due at project start to secure scheduling and materials.",
  "Progress draws due at substantial completion of each major project phase.",
  "Final balance due upon project completion and client walkthrough.",
];

const TERMS = "This estimate is valid for 30 days from date of issue. Prices are subject to change based on material availability. Any work outside the defined scope will be presented as a written change order prior to commencement.";

export default function LegacyEstimate({ estimate, onClose }) {
  const b = useBranding();
  const C = useMemo(() => docPalette(b.brand_primary, b.brand_accent), [b.brand_primary, b.brand_accent]);
  const Label = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.oliveLight, marginBottom: 8 }}>{children}</div>
  );
  const [logoFailed, setLogoFailed] = useState(false);
  const [signedName, setSignedName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signedAt, setSignedAt] = useState(estimate?.signed_at || null);
  const [confirmedName, setConfirmedName] = useState(estimate?.signed_by || '');

  const alreadySigned = !!(signedAt && confirmedName);

  const handleSign = async () => {
    if (!signedName.trim() || !agreed) return;
    if (!estimate?.id) { window.alert('Please save the estimate before signing.'); return; }
    setSigning(true);
    const now = new Date().toISOString();
    await base44.entities.Estimate.update(estimate.id, {
      signed_by: signedName.trim(),
      signed_at: now,
      status: 'approved',
    });
    setConfirmedName(signedName.trim());
    setSignedAt(now);
    setSigning(false);
  };

  const sections = estimate?.sections || [];
  const cols = { show_qty: true, show_unit: true, show_line_total: true, ...(estimate?.column_settings || {}) };
  const gcEnabled = estimate?.gc_fee_enabled ?? false;
  const gcPct = estimate?.gc_fee_pct ?? 10;
  const gcLabel = estimate?.gc_fee_label || 'GC / Project Management Fee';
  const scopeItems = estimate?.scope_of_work || [];
  const lineSubtotal = useMemo(() => calcTotals(sections), [sections]);
  const gcFeeAmount = gcEnabled ? lineSubtotal * (gcPct / 100) : 0;
  const grandTotal = lineSubtotal + gcFeeAmount;

  const estimateNumber = estimate?.estimate_number || (estimate?.id ? `EST-${estimate.id.slice(-8).toUpperCase()}` : 'EST-0001');
  const dateIssued = fmtDate(estimate?.created_date);
  const validThrough = (() => {
    const d = new Date(estimate?.created_date || Date.now());
    d.setDate(d.getDate() + 30);
    return fmtDate(d);
  })();

  return (
    <div style={{ background: C.warmWhite, minHeight: '100vh', fontFamily: "'Highway Gothic', sans-serif", color: C.olive }}>
      <style>{`
        @import url('https://fonts.cdnfonts.com/css/butler');
        @import url('https://fonts.cdnfonts.com/css/highway-gothic');
        * { box-sizing: border-box; }
        .lr-header-logo { height: 52px; }
        .lr-header-title { font-size: 30px; }
        .lr-header-meta { font-size: 12px; }
        @media (min-width: 768px) {
          .lr-header-logo { height: 90px; }
          .lr-header-title { font-size: 42px; }
          .lr-header-meta { font-size: 14px; }
        }
        @media (min-width: 1024px) {
          .lr-header-logo { height: 110px; }
          .lr-header-title { font-size: 52px; }
          .lr-header-meta { font-size: 15px; }
        }
        .lr-print-table { width: 100%; border-collapse: collapse; }
        /* Neutralize the app's global data-table hover styles on every document/layout table. */
        .lr-print-wrap table tr:hover td,
        .lr-print-wrap table tr:hover th { background: transparent !important; }
        .lr-print-table > tbody > tr > td,
        .lr-header-meta td { border-bottom: none !important; }
        .lr-print-thead { display: none; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          /* margin:0 removes the browser's own date/title/URL header & footer.
             We re-create page margins via padding on the table cells below. */
          @page { size: letter; margin: 0; }
          .lr-print-wrap { padding: 0 !important; max-width: none !important; }
          .lr-print-table > tbody > tr > td { padding: 0 0.5in 0.5in !important; }
          .lr-print-thead td { padding: 0.3in 0.5in 0.32in !important; border-bottom: none !important; }
          .lr-header-logo { height: 100px !important; width: auto !important; }
          .lr-header-title { font-size: 36pt !important; }
          .lr-header-meta { font-size: 11pt !important; }
          .lr-line-item { page-break-inside: avoid; break-inside: avoid; }
          /* Keep a whole section together on one page unless it's taller than a page. */
          .lr-section { page-break-inside: avoid; break-inside: avoid; }
          .lr-payment-terms { page-break-inside: avoid; break-inside: avoid; page-break-before: avoid; }
          .lr-page1-header { page-break-inside: avoid; break-inside: avoid; }
          .lr-print-thead { display: table-header-group !important; }
          .lr-print-tbody { display: table-row-group; }
          .lr-print-table { display: table; width: 100%; }
        }
      `}</style>

      {/* ── TOOLBAR ── */}
      {onClose && (
        <div className="no-print" style={{ background: C.cream, borderBottom: `1px solid ${C.rule}`, padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={onClose} style={{ fontSize: 13, color: C.oliveLight, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.06em' }}>← Back</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={async () => {
                if (!estimate?.id) { window.alert('Please save the estimate first, then share.'); return; }
                const publicUrl = `${window.location.origin}/client-estimate?id=${estimate.id}`;
                const projectLabel = estimate?.project_name || estimate?.client_name || 'Project';
                const msg = `Your estimate from ${b.company_name} for ${projectLabel} totaling ${fmt(grandTotal)} is ready for your review and signature. View and sign here: ${publicUrl}`;
                if (navigator.share) {
                  navigator.share({ title: `${b.company_name} Estimate`, text: msg, url: publicUrl }).catch(() => {});
                  return;
                }
                // Desktop: no share sheet — copy the client link to the clipboard.
                try {
                  await navigator.clipboard.writeText(publicUrl);
                  window.alert('Client signing link copied to clipboard. Paste it into a text or email to your client.');
                } catch {
                  window.prompt('Copy this client signing link:', publicUrl);
                }
              }}
              style={{ background: C.olive, color: C.cream, border: 'none', padding: '8px 24px', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 2 }}
            >
              Share via Text
            </button>
            <button
              onClick={() => {
                const originalTitle = document.title;
                document.title = `${estimate?.project_name || estimate?.title || estimate?.estimate_number}_LegacyRenovations`;
                window.print();
                setTimeout(() => { document.title = originalTitle; }, 1000);
              }}
              style={{ background: C.olive, color: C.cream, border: 'none', padding: '8px 24px', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 2 }}
            >
              Print / Save PDF
            </button>
          </div>
        </div>
      )}

      <div className="lr-print-wrap" style={{ maxWidth: 900, margin: '0 auto', padding: '40px 16px 80px', boxSizing: 'border-box', width: '100%', overflowX: 'hidden' }}>

        {/* ── TABLE WRAPPER for repeating print header ── */}
        <table className="lr-print-table">
          <thead className="lr-print-thead">
            <tr>
              <td>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #c8c09a', paddingBottom: 10, marginBottom: 16 }}>
                  <img
                    src={b.logo_url}
                    alt={b.company_name}
                    style={{ height: 36, opacity: 0.85, objectFit: 'contain' }}
                  />
                  <div style={{ fontFamily: "'Butler', serif", fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#3d3d1e' }}>
                    {b.company_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#8a8a52', letterSpacing: '0.06em' }}>
                    Est. {estimateNumber}
                  </div>
                </div>
              </td>
            </tr>
          </thead>
          <tbody className="lr-print-tbody">
            <tr><td>

        {/* ── HEADER ── */}
        <div className="lr-page1-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            {!logoFailed ? (
              <img
                src={b.logo_url}
                alt={b.company_name}
                onError={() => setLogoFailed(true)}
                className="lr-header-logo"
                style={{ objectFit: 'contain', marginBottom: 10 }}
              />
            ) : (
              <div style={{ fontFamily: "'Butler', serif", fontSize: 22, fontWeight: 700, color: C.olive, letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>
                {b.company_name}
              </div>
            )}
            <div style={{ fontSize: 11, color: C.oliveLight, lineHeight: 1.6, letterSpacing: '0.02em', fontFamily: "'Highway Gothic', sans-serif" }}>
              {b.city_state_zip ? b.city_state_zip.replace(/,?\s*\d{5}(-\d{4})?$/, '') : ''}<br />
              {b.established_label}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="lr-header-title" style={{ fontFamily: "'Butler', serif", color: C.olive, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
              Estimate
            </div>
            <table className="lr-header-meta" style={{ marginLeft: 'auto', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ color: C.oliveLight, paddingRight: 16, paddingBottom: 4, letterSpacing: '0.08em' }}>No.</td>
                  <td style={{ color: C.olive, fontWeight: 500, paddingBottom: 4 }}>{estimateNumber}</td>
                </tr>
                <tr>
                  <td style={{ color: C.oliveLight, paddingRight: 16, paddingBottom: 4, letterSpacing: '0.08em' }}>Date Issued</td>
                  <td style={{ color: C.olive, paddingBottom: 4 }}>{dateIssued}</td>
                </tr>
                <tr>
                  <td style={{ color: C.oliveLight, paddingRight: 16, paddingBottom: 4, letterSpacing: '0.08em' }}>Valid Through</td>
                  <td style={{ color: C.olive, paddingBottom: 4 }}>{validThrough}</td>
                </tr>
                {estimate?.status && (
                  <tr>
                    <td style={{ color: C.oliveLight, paddingRight: 16, letterSpacing: '0.08em' }}>Status</td>
                    <td style={{ color: C.olive, textTransform: 'capitalize' }}>{estimate.status}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RULE ── */}
        <div style={{ height: 2, background: C.accent, marginBottom: 24 }} />

        {/* ── CLIENT / PROJECT META ── */}
        {(estimate?.client_name || estimate?.project_name) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px', marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.creamDark}` }}>
            {estimate?.client_name && (
              <div>
                <Label>Prepared For</Label>
                <div style={{ fontFamily: "'Butler', serif", fontSize: 15, color: C.olive, lineHeight: 1.7 }}>
                  {estimate.client_name}
                </div>
              </div>
            )}
            {estimate?.project_name && (
              <div>
                <Label>Project</Label>
                <div style={{ fontSize: 14, color: C.oliveMid, lineHeight: 1.7 }}>
                  <strong style={{ color: C.olive }}>{estimate.title}</strong><br />
                  {estimate.project_name}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── NOTES / SCOPE INTRO ── */}
        {estimate?.notes && (
          <div style={{ fontFamily: "'Highway Gothic', sans-serif", fontSize: 14, color: C.oliveMid, lineHeight: 1.8, padding: '14px 18px', background: C.cream, borderLeft: `3px solid ${C.accent}`, marginBottom: 28 }}>
            {estimate.notes}
          </div>
        )}

        {/* ── SECTIONS ── */}
        {sections.map((section, si) => (
          <div key={section.id || si} className="lr-section" style={{ marginBottom: 24 }}>
            {/* Section header */}
            <div style={{ background: C.cream, padding: '8px 12px', borderTop: `2px solid ${C.accent}`, borderBottom: `1px solid ${C.rule}` }}>
              <span style={{ fontFamily: "'Butler', serif", fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.oliveMid }}>
                {String(si + 1).padStart(2, '0')} · {section.name || `Section ${si + 1}`}
              </span>
            </div>

            {/* Column headers */}
            {(() => {
              const colDefs = [
                { always: true },
                cols.show_qty && { w: 60, label: 'Qty', align: 'center' },
                cols.show_unit && { w: 50, label: 'Unit', align: 'center' },
                cols.show_line_total && { w: 100, label: 'Total', align: 'right' },
              ].filter(Boolean);
              const gridCols = ['1fr', ...colDefs.slice(1).map(c => `${c.w}px`)].join(' ');
              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 0, borderBottom: `1px solid ${C.rule}`, padding: '6px 12px' }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.oliveLight }}>Description</div>
                    {cols.show_qty && <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.oliveLight, textAlign: 'center' }}>Qty</div>}
                    {cols.show_unit && <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.oliveLight, textAlign: 'center' }}>Unit</div>}
                    {cols.show_line_total && <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.oliveLight, textAlign: 'right' }}>Total</div>}
                  </div>

                  {/* Line items */}
                  {(section.line_items || []).map((item, ii) => (
                    <div key={item.id || ii} className="lr-line-item" style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 0, padding: '10px 12px', borderBottom: `0.5px solid ${C.creamDark}`, background: ii % 2 === 0 ? '#fff' : C.warmWhite, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 14, color: C.olive, lineHeight: 1.3 }}>{item.description || ''}</div>
                        {item.item_description && <div style={{ fontSize: 11.2, color: '#8a8a52', marginTop: 2 }}>{item.item_description}</div>}
                      </div>
                      {cols.show_qty && <div style={{ fontSize: 13, color: C.oliveMid, textAlign: 'center' }}>{item.quantity ?? 1}</div>}
                      {cols.show_unit && <div style={{ fontSize: 12, color: C.oliveLight, textAlign: 'center' }}>{item.unit || 'LS'}</div>}
                      {cols.show_line_total && <div style={{ fontSize: 13, fontWeight: 500, color: C.olive, textAlign: 'right' }}>{fmt(item.line_total)}</div>}
                    </div>
                  ))}
                </>
              );
            })()}

            {/* Section subtotal */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', background: C.cream, borderTop: `1px solid ${C.rule}`, gap: 24 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.oliveLight }}>
                {section.name || `Section ${si + 1}`} Subtotal
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.olive, minWidth: 80, textAlign: 'right' }}>
                {fmt(calcSectionTotal(section))}
              </span>
            </div>
          </div>
        ))}

        {/* ── TOTALS ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, marginBottom: 32 }}>
          <div style={{ width: '100%', maxWidth: 340 }}>
            {gcEnabled && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${C.rule}`, fontSize: 13, color: C.oliveMid }}>
                <span>{gcLabel} ({gcPct}%)</span>
                <span>{fmt(gcFeeAmount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `2px solid ${C.accent}`, borderBottom: `2px solid ${C.accent}`, fontFamily: "'Butler', serif", fontSize: 18, color: C.olive }}>
              <span>Total Estimate</span>
              <span>{fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* ── SCOPE OF WORK ── */}
        {scopeItems.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <Label>Scope of Work</Label>
            <div style={{ border: `1px solid ${C.rule}`, borderRadius: 4, overflow: 'hidden' }}>
              {scopeItems.map((item, i) => (
                <div key={item.id || i} style={{ display: 'flex', gap: 12, padding: '9px 14px', borderBottom: i < scopeItems.length - 1 ? `0.5px solid ${C.creamDark}` : 'none', background: i % 2 === 0 ? '#fff' : C.warmWhite }}>
                  <span style={{ fontSize: 11, color: C.oliveLight, minWidth: 18, paddingTop: 1 }}>{String(i + 1).padStart(2, '0')}.</span>
                  <span style={{ fontSize: 13, color: C.oliveMid, lineHeight: 1.6 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PAYMENT SCHEDULE + TERMS ── */}
        <div className="lr-payment-terms" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px', padding: '28px 24px', background: C.cream, borderRadius: 4, border: `1px solid ${C.rule}`, marginBottom: 32 }}>
          <div>
            <Label>Payment Schedule</Label>
            {(b.payment_schedule?.length ? b.payment_schedule : PAYMENT_SCHEDULE).map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: C.oliveMid, lineHeight: 1.6 }}>
                <span style={{ color: C.accent, fontWeight: 700, marginTop: 1 }}>·</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
          <div>
            <Label>Terms &amp; Conditions</Label>
            <div style={{ fontSize: 13, color: C.oliveMid, lineHeight: 1.7 }}>
              {b.estimate_terms || TERMS}
            </div>
          </div>
        </div>

        {/* ── SIGNATURE SECTION ── */}
        <div className="no-print" style={{ marginBottom: 32, padding: '28px 24px', background: '#fff', border: `1px solid ${C.rule}`, borderRadius: 4 }}>
          <Label>Client Acceptance &amp; Electronic Signature</Label>

          {alreadySigned ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '20px 24px', background: '#f0faf0', border: '1.5px solid #4caf50', borderRadius: 4 }}>
              <div style={{ fontSize: 28, marginTop: 2 }}>✓</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#2e7d32', marginBottom: 4 }}>Estimate Accepted</div>
                <div style={{ fontSize: 13, color: '#4a7c4e', lineHeight: 1.7 }}>
                  Signed by <strong style={{ fontFamily: 'Georgia, serif' }}>{confirmedName}</strong> on{' '}
                  {new Date(signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at{' '}
                  {new Date(signedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.oliveLight, marginBottom: 6 }}>Full Name</div>
                <input
                  type="text"
                  value={signedName}
                  onChange={e => setSignedName(e.target.value)}
                  placeholder="Type your full name..."
                  style={{ width: '100%', maxWidth: 400, padding: '10px 14px', border: `1px solid ${C.rule}`, borderRadius: 2, fontSize: 14, color: C.olive, background: C.warmWhite, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              {signedName.trim() && (
                <div style={{ marginBottom: 20, padding: '14px 20px', background: C.cream, border: `1px solid ${C.creamDark}`, borderRadius: 2 }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.oliveLight, marginBottom: 8 }}>Signature Preview</div>
                  <div style={{ fontFamily: "'Pinyon Script', cursive", fontSize: 34, color: C.olive, lineHeight: 1.2 }}>
                    {signedName}
                  </div>
                  <style>{`@import url('https://fonts.googleapis.com/css2?family=Pinyon+Script&display=swap');`}</style>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  style={{ marginTop: 3, accentColor: C.olive, width: 16, height: 16, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: C.oliveMid, lineHeight: 1.6 }}>
                  I have read and agree to the terms and conditions stated in this estimate. I understand this constitutes an electronic signature and authorizes {b.company_name} to proceed with the outlined scope of work upon receipt of the initial deposit.
                </span>
              </label>

              <button
                onClick={handleSign}
                disabled={!signedName.trim() || !agreed || signing}
                style={{
                  background: signedName.trim() && agreed ? C.olive : C.creamDark,
                  color: signedName.trim() && agreed ? C.cream : C.oliveLight,
                  border: 'none', padding: '12px 32px', fontSize: 11,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  cursor: signedName.trim() && agreed ? 'pointer' : 'not-allowed',
                  borderRadius: 2, transition: 'background 0.2s',
                }}
              >
                {signing ? 'Saving...' : 'Accept & Sign Estimate'}
              </button>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.oliveLight, lineHeight: 2, borderTop: `1px solid ${C.rule}`, paddingTop: 20 }}>
          {b.company_name} &nbsp;·&nbsp; {b.website}
          <div style={{ fontSize: 8.5, letterSpacing: '0.1em', color: C.rule, marginTop: 6, textTransform: 'none' }}>
            Presented with GuildWright
          </div>
        </div>

            </td></tr>
          </tbody>
        </table>

      </div>
    </div>
  );
}