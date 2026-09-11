import { PRIMARY_LOGO, ICON_MARK } from '../../LegacyLogos';
import { ArrowLeft, Printer } from 'lucide-react';
import { useBranding } from '@/lib/useBranding';

const C = {
  olive:      '#30381E',
  oliveMid:   '#5a5a2a',
  oliveLight: '#7A7560',
  cream:      '#F5F3EC',
  creamDark:  '#D4CFBA',
  warmWhite:  '#faf8f4',
  bg:         '#EAE8E1',
  rule:       '#D4CFBA',
  green:      '#2d5a27',
  greenLight: '#edf5ec',
  red:        '#7a2020',
  redLight:   '#fde8e8',
};

const PAYMENT_TERMS_LABELS = {
  due_on_receipt: 'Due on Receipt',
  net_10: 'Net 10',
  net_15: 'Net 15',
  net_30: 'Net 30',
};

const STATUS_STYLES = {
  draft: { bg: C.creamDark,   color: C.olive },
  sent:  { bg: C.olive,       color: '#EAE8E1' },
  paid:  { bg: C.green,       color: C.greenLight },
  void:  { bg: C.redLight,    color: C.red },
};

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

const CAT_LABELS = { materials: 'Materials', labor: 'Labor', subcontractor: 'Subcontractor', other: 'Other' };

// Group line items by category
function groupByCategory(lineItems) {
  const groups = {};
  (lineItems || []).forEach(item => {
    const cat = item.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });
  return groups;
}

export default function InvoicePrintView({ invoice, onBack }) {
  const b = useBranding();
  const statusStyle = STATUS_STYLES[invoice.status] || STATUS_STYLES.draft;
  const groups = groupByCategory(invoice.line_items);
  const termsLabel = PAYMENT_TERMS_LABELS[invoice.payment_terms] || invoice.payment_terms || '';

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Overpass', 'Arial Narrow', sans-serif", color: C.olive }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Overpass:wght@300;400;500;600;700&display=swap');
        @font-face {
          font-family: 'Butler';
          src: url('https://fonts.cdnfonts.com/s/29004/Butler_Regular.woff') format('woff');
          font-weight: 400;
        }
        @font-face {
          font-family: 'Butler';
          src: url('https://fonts.cdnfonts.com/s/29004/Butler_Bold.woff') format('woff');
          font-weight: 700;
        }
        * { box-sizing: border-box; }
        .inv-print-toolbar { background: ${C.warmWhite}; border-bottom: 1px solid ${C.rule}; padding: 14px 32px; display: flex; justify-content: space-between; align-items: center; }
        .inv-no-print { }
        .inv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .inv-table th { font-size: 10px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: ${C.oliveLight}; padding: 0 8px 10px; text-align: left; }
        .inv-table th.right { text-align: right; }
        .inv-table .cat-header td { background: #f7f4ee; font-size: 10px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: ${C.oliveMid}; padding: 8px; }
        .inv-table .item-row td { padding: 10px 8px; border-bottom: 0.5px solid ${C.creamDark}; vertical-align: top; }
        .item-name { font-family: 'Butler', Georgia, serif; font-size: 14px; color: ${C.olive}; }
        .item-desc { font-size: 11px; color: ${C.oliveLight}; line-height: 1.5; margin-top: 2px; }
        @media print {
          nav, header, aside, .inv-no-print,
          [class*="sidebar"], [class*="AppLayout"], [class*="bottom-bar"] { display: none !important; }
          body { background: white !important; margin: 0 !important; }
          /* margin:0 removes the browser's date/title/URL header & footer; page
             margins re-created via padding on the wrapper. */
          @page { size: letter; margin: 0; }
          .inv-print-wrap { padding: 0.5in !important; max-width: none !important; }
          .inv-print-toolbar { display: none !important; }
          .inv-sheet { box-shadow: none !important; }
        }
      `}</style>

      {/* Toolbar (hidden on print) */}
      <div className="inv-print-toolbar inv-no-print">
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.oliveLight, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} /> Back to Invoices
        </button>
        <button
          onClick={() => window.print()}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.olive, color: '#EAE8E1', border: 'none', borderRadius: 4, padding: '8px 20px', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Overpass, sans-serif' }}
        >
          <Printer style={{ width: 14, height: 14 }} /> Print / Save PDF
        </button>
      </div>

      {/* Invoice sheet */}
      <div className="inv-print-wrap" style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div className="inv-sheet" style={{ background: C.warmWhite, borderRadius: 6, padding: '36px 40px', boxShadow: '0 2px 20px rgba(0,0,0,0.08)' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 24, borderBottom: `1.5px solid ${C.rule}`, marginBottom: 28 }}>
            <img src={b.logo_url || PRIMARY_LOGO} alt={b.company_name} style={{ height: 52 }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Butler', Georgia, serif", fontSize: 32, color: C.olive, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                Invoice
              </div>
              <div style={{ fontFamily: 'Overpass, sans-serif', fontSize: 12, color: C.oliveLight, lineHeight: 2 }}>
                <div>
                  <span style={{ fontFamily: "'Butler', Georgia, serif", fontSize: 15, color: C.olive }}>{invoice.invoice_number || ''}</span>
                </div>
                <div>Issued: {fmtDate(invoice.issue_date)}</div>
                {invoice.due_date && <div>Due: {fmtDate(invoice.due_date)}</div>}
                <div style={{ marginTop: 6 }}>
                  <span style={{ background: statusStyle.bg, color: statusStyle.color, padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    {invoice.status || 'Draft'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Client & Project */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px', marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.oliveLight, marginBottom: 8 }}>Bill To</div>
              <div style={{ fontFamily: "'Butler', Georgia, serif", fontSize: 15, lineHeight: 1.7, color: C.olive }}>
                {invoice.client_name || ''}
              </div>
              {invoice.client_email && (
                <div style={{ fontFamily: 'Overpass, sans-serif', fontSize: 13, color: C.oliveLight, marginTop: 2 }}>{invoice.client_email}</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.oliveLight, marginBottom: 8 }}>Project</div>
              <div style={{ fontFamily: "'Butler', Georgia, serif", fontSize: 15, color: C.olive, lineHeight: 1.7 }}>{invoice.project_name || ''}</div>
              {termsLabel && (
                <div style={{ fontFamily: 'Overpass, sans-serif', fontSize: 12, color: C.oliveLight, marginTop: 4 }}>Payment Terms: {termsLabel}</div>
              )}
            </div>
          </div>

          {/* Line items table */}
          <table className="inv-table">
            <thead>
              <tr style={{ borderBottom: `1.5px solid ${C.oliveMid}` }}>
                <th style={{ width: '45%' }}>Item</th>
                <th style={{ width: '25%' }}>Description</th>
                <th style={{ textAlign: 'center', width: '8%' }}>Qty</th>
                <th style={{ textAlign: 'right', width: '10%' }}>Unit</th>
                <th className="right" style={{ width: '12%' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).map(([cat, items]) => (
                <>
                  <tr key={cat + '-h'} className="cat-header">
                    <td colSpan={5}>{CAT_LABELS[cat] || cat}</td>
                  </tr>
                  {items.map((item, i) => (
                    <tr key={item.id || i} className="item-row">
                      <td>
                        <div className="item-name">{item.name || ''}</div>
                        {item.description && <div className="item-desc">{item.description}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: C.oliveLight }}>{item.cost_code || ''}</td>
                      <td style={{ textAlign: 'center', color: C.oliveMid, fontSize: 13 }}>{item.quantity ?? 1}</td>
                      <td style={{ textAlign: 'right', color: C.oliveMid, fontSize: 13 }}>{fmt(item.unit_cost)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontFamily: "'Butler', Georgia, serif", fontSize: 14 }}>{fmt(item.line_total)}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <div style={{ width: '100%', maxWidth: 340 }}>
              {(invoice.subtotal > 0 || invoice.total_markup > 0) && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `0.5px solid ${C.creamDark}`, fontSize: 13, color: C.oliveLight }}>
                    <span>Subtotal</span><span>{fmt(invoice.subtotal)}</span>
                  </div>
                  {invoice.total_markup > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `0.5px solid ${C.creamDark}`, fontSize: 13, color: C.oliveLight }}>
                      <span>Markup</span><span>{fmt(invoice.total_markup)}</span>
                    </div>
                  )}
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', marginTop: 2, borderTop: `1.5px solid ${C.oliveMid}`, borderBottom: `1.5px solid ${C.oliveMid}`, fontFamily: "'Butler', Georgia, serif", fontSize: 22, color: C.olive }}>
                <span>Grand Total</span><span>{fmt(invoice.grand_total)}</span>
              </div>
            </div>
          </div>

          {/* Payment terms box */}
          {(termsLabel || invoice.notes) && (
            <div style={{ marginTop: 32, background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '20px 24px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.oliveLight, marginBottom: 10 }}>Payment Terms</div>
              {termsLabel && (
                <div style={{ fontFamily: "'Butler', Georgia, serif", fontSize: 15, color: C.olive, marginBottom: invoice.notes ? 8 : 0 }}>{termsLabel}</div>
              )}
              {invoice.notes && (
                <div style={{ fontFamily: 'Overpass, sans-serif', fontSize: 13, color: C.oliveMid, lineHeight: 1.7 }}>{invoice.notes}</div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 40, textAlign: 'center', borderTop: `0.5px solid ${C.rule}`, paddingTop: 24 }}>
            <img src={ICON_MARK} alt="" style={{ height: 22, opacity: 0.4, display: 'block', margin: '0 auto 8px' }} />
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.oliveLight, lineHeight: 2 }}>
              {b.website && <a href={b.website.startsWith('http') ? b.website : `https://${b.website}`} style={{ color: C.oliveLight, textDecoration: 'none' }}>{b.website}</a>}
              {b.city_state_zip ? <>{' '}·{' '}{b.city_state_zip.replace(/,?\s*\d{5}(-\d{4})?$/, '')}</> : null}
              {b.established_label ? <>{' '}·{' '}{b.established_label}</> : null}
            </div>
            <div style={{ fontSize: 8.5, letterSpacing: '0.1em', color: C.rule, marginTop: 6 }}>
              Presented with GuildWright
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}