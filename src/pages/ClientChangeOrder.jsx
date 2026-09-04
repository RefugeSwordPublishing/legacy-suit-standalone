import { useState, useEffect, useContext, useMemo, createContext } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { PRIMARY_LOGO, ICON_MARK } from "../LegacyLogos";
import { docPalette } from "@/lib/docPalette";
import { Loader2 } from "lucide-react";

const fmt = (n) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatTimestamp = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
};

const formatDate = (str) => {
  if (!str) return "";
  const d = new Date(str + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// Fixed status colors (success/warn/error) that don't follow the brand.
const STATUS = {
  green: "#2d5a27", greenLight: "#edf5ec", red: "#7a2020", redLight: "#fdf0f0",
  amber: "#7a5a00", amberLight: "#fffbea",
};
const LEGACY_C = { ...docPalette(null, null), ...STATUS };
// Per-tenant document palette (dark on-brand text + brand accent), provided by the main component.
const PaletteCtx = createContext(LEGACY_C);

const Label = ({ children, style = {} }) => {
  const C = useContext(PaletteCtx);
  return (
    <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.18em",
      textTransform: "uppercase", color: C.oliveLight, marginBottom: 8, ...style }}>
      {children}
    </div>
  );
};

const Rule = ({ style = {} }) => {
  const C = useContext(PaletteCtx);
  return <hr style={{ border: "none", borderTop: `1px solid ${C.rule}`, margin: "24px 0", ...style }} />;
};

// Normalize sections from either line_items or items field
const normalizeSections = (sections) =>
  (sections || []).map(sec => ({
    ...sec,
    title: sec.title || sec.name || "Section",
    items: (sec.line_items || sec.items || []).map(item => ({
      name: item.description || item.name || "",
      description: item.client_description || item.item_description || "",
      qty: item.quantity || item.qty || 1,
      unit: item.unit || "",
      amount: item.line_total || item.total || (item.unit_price * (item.quantity || item.qty || 1)) || 0,
    })),
  }));

const secTotal = (sec) => (sec.items || []).reduce((s, i) => s + Number(i.amount || 0), 0);

// ── Line table, identical structure to estimate ──────────────
function LineTable({ sections }) {
  const C = useContext(PaletteCtx);
  return (
    <>
      <style>{`
        .lr-line-table { width:100%; border-collapse:collapse; font-size:14px; }
        .lr-line-table th { font-size:10px; font-weight:500; letter-spacing:0.16em; text-transform:uppercase; color:${C.oliveLight}; padding:0 8px 10px; text-align:left; }
        .lr-line-table th.center { text-align:center; }
        .lr-line-table th.right { text-align:right; }
        .lr-line-table td { padding:10px 8px; }
        .lr-mobile-cards { display:none; }
        @media (max-width: 640px) {
          .lr-line-table { display:none; }
          .lr-mobile-cards { display:block; }
          .lr-section-header { font-size:10px; font-weight:500; letter-spacing:0.18em; text-transform:uppercase; color:${C.oliveMid}; background:${C.cream}; padding:8px 12px; margin-top:16px; }
          .lr-item-card { border-bottom:0.5px solid ${C.creamDark}; padding:12px 4px; }
          .lr-item-name { font-family:'Butler',serif; font-size:15px; color:${C.olive}; margin-bottom:4px; }
          .lr-item-desc { font-size:12px; color:${C.oliveLight}; line-height:1.5; margin-bottom:6px; }
          .lr-item-meta { display:flex; justify-content:space-between; align-items:center; }
          .lr-item-qty-unit { font-size:12px; color:${C.oliveMid}; }
          .lr-item-amount { font-size:14px; font-weight:500; color:${C.olive}; }
        }
      `}</style>

      {/* Desktop table */}
      <table className="lr-line-table">
        <thead>
          <tr style={{ borderBottom: `1.5px solid ${C.oliveMid}` }}>
            <th>Item</th>
            <th>Description</th>
            <th className="center">Qty</th>
            <th className="center">Unit</th>
            <th className="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => (
            <>
              <tr key={sec.id + "-h"}>
                <td colSpan={5} style={{ background: C.cream, fontSize: 10, fontWeight: 500,
                  letterSpacing: "0.18em", textTransform: "uppercase", color: C.oliveMid,
                  padding: "8px", borderBottom: "none" }}>{sec.title}</td>
              </tr>
              {sec.items.map((item, i) => (
                <tr key={(sec.id || sec.title) + i} style={{ borderBottom: `0.5px solid ${C.creamDark}` }}>
                  <td style={{ fontFamily: "'Butler', serif", fontSize: 15, width: "30%" }}>{item.name}</td>
                  <td style={{ fontSize: 12, color: C.oliveLight, width: "35%", lineHeight: 1.5 }}>{item.description}</td>
                  <td style={{ textAlign: "center", color: C.oliveMid, width: "8%" }}>{item.qty}</td>
                  <td style={{ textAlign: "center", color: C.oliveMid, width: "8%" }}>{item.unit}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap", width: "14%" }}>{fmt(item.amount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} style={{ textAlign: "right", fontSize: 10, color: C.oliveLight,
                  letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 8px",
                  background: C.cream }}>Section Total</td>
                <td style={{ textAlign: "right", fontWeight: 500, color: C.olive,
                  padding: "6px 8px", background: C.cream }}>{fmt(secTotal(sec))}</td>
              </tr>
            </>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <div className="lr-mobile-cards">
        {sections.map((sec) => (
          <div key={sec.id || sec.title}>
            <div className="lr-section-header">{sec.title}</div>
            {sec.items.map((item, i) => (
              <div key={(sec.id || sec.title) + i} className="lr-item-card">
                <div className="lr-item-name">{item.name}</div>
                {item.description && <div className="lr-item-desc">{item.description}</div>}
                <div className="lr-item-meta">
                  <span className="lr-item-qty-unit">{item.qty} {item.unit}</span>
                  <span className="lr-item-amount">{fmt(item.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Contract summary totals (change order specific) ───────────
function ContractTotals({ originalTotal, changeOrderTotal, newContractTotal }) {
  const C = useContext(PaletteCtx);
  const isPositive = changeOrderTotal >= 0;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", margin: "8px 0 0" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          padding: "6px 0", borderBottom: `0.5px solid ${C.creamDark}`,
          fontSize: 13, color: C.oliveMid }}>
          <span>Original Contract Total</span>
          <span>{fmt(originalTotal)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between",
          padding: "6px 0", borderBottom: `0.5px solid ${C.creamDark}`,
          fontSize: 13, color: isPositive ? C.amber : C.red }}>
          <span>This Change Order</span>
          <span style={{ fontWeight: 500 }}>{isPositive ? "+" : ""}{fmt(changeOrderTotal)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between",
          padding: "10px 0", marginTop: 2,
          borderTop: `2px solid ${C.accent}`, borderBottom: `2px solid ${C.accent}`,
          fontFamily: "'Butler', serif", fontSize: 18, color: C.olive }}>
          <span>New Contract Total</span>
          <span>{fmt(newContractTotal)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Signed banner ─────────────────────────────────────────────
function SignedBanner({ co }) {
  const C = useContext(PaletteCtx);
  return (
    <div style={{ background: C.greenLight, border: `1.5px solid ${C.green}`,
      borderRadius: 6, padding: "20px 24px", marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 20 }}>✓</span>
        <span style={{ fontWeight: 600, fontSize: 16, color: C.green }}>Change Order Accepted</span>
      </div>
      <div style={{ fontSize: 13, color: C.green, lineHeight: 1.7 }}>
        <strong>Signed by:</strong> {co.signedBy}<br />
        <strong>Accepted on:</strong> {formatTimestamp(co.signedAt)}<br />
        <strong>Change Order:</strong> {co.changeOrderNumber}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: C.oliveLight }}>
        This change order has been recorded. {co.branding?.company_name || "Legacy Renovations"} will be in touch to confirm next steps.
      </div>
    </div>
  );
}

// ── Signature panel, identical structure to estimate ─────────
function SignaturePanel({ co, onSave }) {
  const C = useContext(PaletteCtx);
  const [name, setName]           = useState("");
  const [agreed, setAgreed]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [nameError, setNameError] = useState("");

  const clientName = co.clientName || "";
  const isBusinessName = /llc|inc|corp|co\.|company/i.test(clientName);
  const greeting = isBusinessName ? "there" : clientName.split(" ")[0] || "there";
  const isValid = name.trim().length >= 3 && agreed;

  const handleSubmit = async () => {
    if (name.trim().length < 3) { setNameError("Please enter your full name to sign."); return; }
    if (!agreed) return;
    setLoading(true);
    setError("");
    try {
      await onSave({ signedBy: name.trim(), signedAt: new Date().toISOString() });
    } catch (e) {
      setError("Something went wrong saving your signature. Please try again or contact us.");
      setLoading(false);
    }
    setLoading(false);
  };

  return (
    <div style={{ marginTop: 40, background: C.cream,
      border: `1.5px solid ${C.rule}`, borderRadius: 6, padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <img src={ICON_MARK} alt="" style={{ height: 28, opacity: 0.7 }} />
        <div style={{ fontFamily: "'Butler', serif", fontSize: 20, color: C.olive, letterSpacing: "0.06em" }}>
          Accept This Change Order
        </div>
      </div>
      <div style={{ fontSize: 13, color: C.oliveLight, marginBottom: 24, lineHeight: 1.6 }}>
        Hi {greeting}, please review the change order above, then type your full name below to accept. This serves as your electronic signature and authorization for {co.branding?.company_name || "Legacy Renovations"} to proceed.
      </div>

      <Rule style={{ margin: "0 0 24px" }} />

      <Label>Your Full Name (Electronic Signature)</Label>
      <input
        type="text"
        placeholder="Type your full legal name"
        value={name}
        onChange={(e) => { setName(e.target.value); setNameError(""); }}
        style={{
          width: "100%", maxWidth: 400,
          fontFamily: "'Pinyon Script', cursive",
          fontSize: 22, color: C.olive,
          border: "none", borderBottom: `2px solid ${nameError ? C.red : C.oliveMid}`,
          background: "transparent", outline: "none",
          padding: "8px 0", marginBottom: nameError ? 6 : 16,
          letterSpacing: "0.04em",
        }}
      />
      {nameError && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{nameError}</div>}

      {name.trim().length >= 2 && (
        <div style={{ marginBottom: 20, padding: "10px 16px",
          background: C.warmWhite, border: `1px solid ${C.rule}`, borderRadius: 4,
          display: "inline-block", minWidth: 260 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
            color: C.oliveLight, marginBottom: 6 }}>Signature Preview</div>
          <div style={{ fontFamily: "'Pinyon Script', cursive",
            fontSize: 28, color: C.olive, letterSpacing: "0.02em" }}>{name}</div>
          <div style={{ borderTop: `1px solid ${C.rule}`, marginTop: 6, paddingTop: 4,
            fontSize: 10, color: C.oliveLight }}>
            {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 24 }}>
        <input type="checkbox" id="agree" checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ marginTop: 3, accentColor: C.olive, width: 16, height: 16, cursor: "pointer" }} />
        <label htmlFor="agree" style={{ fontSize: 13, color: C.oliveMid, lineHeight: 1.6, cursor: "pointer" }}>
          By checking this box and typing my name above, I confirm that I have read and agree to this change order, including the revised scope of work, adjusted contract total, and terms outlined by {co.branding?.company_name || "Legacy Renovations"}.
        </label>
      </div>

      {error && (
        <div style={{ background: C.redLight, border: `1px solid ${C.red}`,
          borderRadius: 4, padding: "10px 14px", fontSize: 13, color: C.red, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button onClick={handleSubmit} disabled={!isValid || loading} style={{
          background: isValid && !loading ? C.olive : "#aaa",
          color: "#f7f4ee", border: "none", padding: "12px 32px", fontSize: 12,
          letterSpacing: "0.2em", textTransform: "uppercase",
          cursor: isValid && !loading ? "pointer" : "not-allowed",
          fontFamily: "'Highway Gothic', sans-serif", borderRadius: 2, transition: "background 0.2s",
        }}>
          {loading ? "Saving..." : "Accept & Sign Change Order"}
        </button>
        <button onClick={() => {
          const title = `${co.changeOrderNumber}_${(co.clientName || 'Client').replace(/\s+/g,'_')}_Signed_${new Date().toISOString().slice(0,10)}`;
          const prev = document.title;
          document.title = title;
          window.print();
          setTimeout(() => { document.title = prev; }, 1000);
        }} style={{
          background: "transparent", color: C.oliveLight,
          border: `1px solid ${C.rule}`, padding: "12px 24px", fontSize: 12,
          letterSpacing: "0.18em", textTransform: "uppercase",
          cursor: "pointer", fontFamily: "'Highway Gothic', sans-serif", borderRadius: 2,
        }}>
          Save PDF
        </button>
      </div>

      {co.branding?.website && (
        <div style={{ marginTop: 16, fontSize: 11, color: C.oliveLight, lineHeight: 1.6 }}>
          Questions? Visit{" "}
          <a href={co.branding.website.startsWith("http") ? co.branding.website : `https://${co.branding.website}`} style={{ color: C.oliveLight }}>
            {co.branding.website}
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function ClientChangeOrderPage() {
  const { id } = useParams();
  const [co, setCo]           = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!id) { setError("No change order ID provided."); setLoading(false); return; }
    base44.functions.invoke("getPublicChangeOrder", { changeOrderId: id })
      .then(res => {
        if (res.data?.error) { setError(res.data.error); }
        else {
          const raw = res.data.changeOrder;
          const sections = normalizeSections(raw.sections);
          const computedCOTotal = sections.reduce((s, sec) => s + secTotal(sec), 0);
          setCo({
            id: raw.id,
            changeOrderNumber: raw.change_order_number || raw.id?.slice(-8).toUpperCase(),
            title: raw.title || "Change Order",
            clientName: raw.client_name || "",
            clientEmail: raw.client_email || "",
            projectName: raw.project_name || "",
            dateIssued: raw.date_issued ? formatDate(raw.date_issued) : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
            validThrough: raw.valid_through ? formatDate(raw.valid_through) : "",
            sections,
            originalTotal: raw.original_estimate_total || 0,
            changeOrderTotal: raw.change_order_total || computedCOTotal,
            newContractTotal: raw.new_contract_total || ((raw.original_estimate_total || 0) + (raw.change_order_total || computedCOTotal)),
            scopeOfWork: raw.scope_of_work || "",
            signedBy: raw.signed_by || null,
            signedAt: raw.signed_at || null,
            status: raw.status || "draft",
            branding: raw.branding || null,
          });
        }
        setLoading(false);
      })
      .catch(() => { setError("Change order not found."); setLoading(false); });
  }, [id]);

  const handleSave = async ({ signedBy, signedAt }) => {
    await base44.functions.invoke("saveChangeOrderSignature", { changeOrderId: id, signedBy, signedAt });
    setCo(prev => ({ ...prev, status: "approved", signedBy, signedAt }));
  };

  const handleShare = () => {
    const cn = co.branding?.company_name || "Legacy Renovations";
    const msg = `Your change order ${co.changeOrderNumber} from ${cn} for ${co.title}, New Contract Total: ${fmt(co.newContractTotal)}. Review and sign here: ${window.location.href}`;
    if (navigator.share) {
      navigator.share({ title: `${cn} Change Order`, text: msg, url: window.location.href });
    } else {
      window.location.href = `sms:?body=${encodeURIComponent(msg)}`;
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#e8e3d8" }}>
        <Loader2 style={{ width: 32, height: 32, color: "#3d3d1e" }} className="animate-spin" />
      </div>
    );
  }

  if (error || !co) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#e8e3d8", fontFamily: "sans-serif", color: "#3d3d1e" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Change Order Not Found</div>
          <div style={{ fontSize: 14, color: "#8a8a52" }}>{error || "This link may be expired or invalid."}</div>
        </div>
      </div>
    );
  }

  const isSigned = co.status === "approved" && co.signedBy;

  // Per-tenant branding from the public RPC (blank fallbacks never leak another tenant's details).
  const b = co.branding || {};
  const companyName = b.company_name || "Legacy Renovations";
  const logoUrl = b.logo_url || PRIMARY_LOGO;
  const website = b.website || "";
  const cityState = (b.city_state_zip || "").replace(/,?\s*\d{5}(-\d{4})?$/, "");
  const established = b.established_label || "";
  const C = useMemo(() => ({ ...docPalette(b.brand_primary, b.brand_accent), ...STATUS }), [b.brand_primary, b.brand_accent]);

  return (
   <PaletteCtx.Provider value={C}>
    <div style={{ background: "#e8e3d8", minHeight: "100vh", fontFamily: "'Highway Gothic', sans-serif", color: C.olive }}>
      <style>{`
        /* Same document fonts as the estimate (Butler / Highway Gothic / Pinyon Script) so a tenant's
           client-facing estimate and change order read as one consistent set. */
        @import url('https://fonts.cdnfonts.com/css/butler');
        @import url('https://fonts.cdnfonts.com/css/highway-gothic');
        @import url('https://fonts.googleapis.com/css2?family=Pinyon+Script&display=swap');
        * { box-sizing: border-box; }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          /* margin:0 removes the browser's own date/title/URL header & footer;
             page margins are re-created via padding on the content wrapper. */
          @page { size: letter; margin: 0; }
          .lr-client-wrap { padding: 0.5in !important; max-width: none !important; }
        }
      `}</style>

      {/* Top nav bar */}
      <div className="no-print" style={{ background: C.warmWhite,
        borderBottom: `1px solid ${C.rule}`, padding: "14px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <img src={logoUrl} alt={companyName} style={{ height: 36 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.oliveLight }}>
            {co.changeOrderNumber}
            {isSigned && (
              <span style={{ marginLeft: 10, background: C.greenLight, color: C.green,
                padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 500 }}>
                ✓ Accepted
              </span>
            )}
          </span>
          <button onClick={handleShare} style={{
            background: C.olive, color: "#f7f4ee", border: "none",
            padding: "8px 16px", fontSize: 11, letterSpacing: "0.16em",
            textTransform: "uppercase", cursor: "pointer",
            fontFamily: "'Highway Gothic', sans-serif", borderRadius: 2,
          }}>Share via Text</button>
          <button onClick={() => {
            const title = `${co.changeOrderNumber}_${co.title}_LegacyRenovations`;
            const prev = document.title;
            document.title = title;
            window.print();
            setTimeout(() => { document.title = prev; }, 1000);
          }} style={{
            background: C.olive, color: "#f7f4ee", border: "none",
            padding: "8px 16px", fontSize: 11, letterSpacing: "0.16em",
            textTransform: "uppercase", cursor: "pointer",
            fontFamily: "'Highway Gothic', sans-serif", borderRadius: 2,
          }}>Print / Save PDF</button>
        </div>
      </div>

      <div className="lr-client-wrap" style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Main card */}
        <div style={{ background: C.warmWhite, borderRadius: 6, padding: "32px 36px",
          boxShadow: "0 2px 20px rgba(0,0,0,0.08)", marginBottom: 2 }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "flex-start", paddingBottom: 20,
            borderBottom: `1.5px solid ${C.rule}`, marginBottom: 24 }}>
            <div>
              <img src={logoUrl} alt={companyName} style={{ height: 56, display: "block" }} />
              <div style={{ marginTop: 8, fontSize: 11, color: C.oliveLight, letterSpacing: "0.08em" }}>
                {[cityState, established].filter(Boolean).join("  ·  ")}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: C.oliveLight,
              letterSpacing: "0.06em", lineHeight: 1.9 }}>
              <div style={{ fontFamily: "'Butler', serif", fontSize: 26, color: C.olive,
                letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4, whiteSpace: "nowrap" }}>
                Change Order
              </div>
              <div style={{ fontSize: 11 }}>No. {co.changeOrderNumber}</div>
              Date Issued: {co.dateIssued}<br />
              {co.validThrough && <>Valid Through: {co.validThrough}<br /></>}
              {website}
            </div>
          </div>

          {/* Client & project */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px", marginBottom: 24 }}>
            <div>
              <Label>Prepared For</Label>
              <div style={{ fontFamily: "'Butler', serif", fontSize: 15, lineHeight: 1.6 }}>
                {co.clientName}
                {co.clientEmail && <><br /><span style={{ fontSize: 13, color: C.oliveMid }}>{co.clientEmail}</span></>}
              </div>
            </div>
            <div>
              <Label>Project</Label>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: C.oliveMid }}>
                <strong style={{ color: C.olive }}>{co.title}</strong><br />
                {co.projectName}
              </div>
            </div>
          </div>

          {/* Scope of work */}
          {co.scopeOfWork && (
            <div style={{ fontFamily: "'Butler', serif", fontStyle: "italic",
              fontSize: 14, color: C.oliveMid, lineHeight: 1.8,
              padding: "14px 18px", background: C.cream, borderLeft: `2px solid ${C.rule}`,
              marginBottom: 28 }}>
              {co.scopeOfWork}
            </div>
          )}

          {/* Line items */}
          {co.sections.length > 0 && (
            <>
              <Label style={{ marginBottom: 16 }}>Change Order Line Items</Label>
              <LineTable sections={co.sections} />
            </>
          )}
        </div>

        {/* Totals card */}
        <div style={{ background: C.warmWhite, borderRadius: 6, padding: "24px 36px",
          boxShadow: "0 2px 20px rgba(0,0,0,0.08)", marginTop: 2, marginBottom: 2 }}>
          <ContractTotals
            originalTotal={co.originalTotal}
            changeOrderTotal={co.changeOrderTotal}
            newContractTotal={co.newContractTotal}
          />
        </div>

        {/* Terms card */}
        <div style={{ background: C.warmWhite, borderRadius: 6, padding: "28px 36px",
          boxShadow: "0 2px 20px rgba(0,0,0,0.08)", marginTop: 2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>
            <div>
              <Label>Payment Terms</Label>
              <div style={{ fontSize: 13, color: C.oliveMid, lineHeight: 1.7 }}>
                The additional amount due for this change order is invoiced per the project payment schedule. Work outlined in this change order will commence upon signed acceptance.
              </div>
            </div>
            <div>
              <Label>Terms & Conditions</Label>
              <div style={{ fontSize: 13, color: C.oliveMid, lineHeight: 1.7 }}>
                This change order modifies the original contract. All other terms and conditions of the original agreement remain in full effect unless explicitly amended herein.
              </div>
            </div>
          </div>

          {/* Print signature block */}
          <div style={{ marginTop: 40, pageBreakInside: "avoid" }}>
            <Rule />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>
              <div>
                <Label>Client Acceptance</Label>
                {isSigned ? (
                  <>
                    <div style={{ fontFamily: "'Pinyon Script', cursive",
                      fontSize: 28, color: C.olive, marginBottom: 4 }}>{co.signedBy}</div>
                    <div style={{ fontSize: 11, color: C.oliveLight }}>{formatTimestamp(co.signedAt)}</div>
                  </>
                ) : (
                  <>
                    <div style={{ borderBottom: `1px solid ${C.olive}`, marginBottom: 8, height: 36 }} />
                    <div style={{ fontSize: 11, color: C.oliveLight }}>Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div>
                  </>
                )}
              </div>
              <div>
                <Label>{companyName} Authorization</Label>
                <div style={{ borderBottom: `1px solid ${C.olive}`, marginBottom: 8, height: 36 }} />
                <div style={{ fontSize: 11, color: C.oliveLight }}>Authorized Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div>
              </div>
            </div>
          </div>
        </div>

        {/* Signature panel or signed banner */}
        {isSigned
          ? <SignedBanner co={co} />
          : <SignaturePanel co={co} onSave={handleSave} />
        }

        <div style={{ marginTop: 40, textAlign: "center",
          fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
          color: C.oliveLight, lineHeight: 2, borderTop: `1px solid ${C.rule}`, paddingTop: 20 }}>
          <img src={ICON_MARK} alt="" style={{ height: 22, opacity: 0.4,
            display: "block", margin: "0 auto 8px" }} />
          {[website, cityState, established].filter(Boolean).map((part, i, arr) => (
            <span key={i}>{part}{i < arr.length - 1 ? <>&nbsp;·&nbsp;</> : null}</span>
          ))}
          <div style={{ fontSize: 8.5, letterSpacing: "0.1em", color: C.rule, marginTop: 6, textTransform: "none" }}>
            Presented with GuildWright
          </div>
        </div>
      </div>
    </div>
   </PaletteCtx.Provider>
  );
}