import { useState, useEffect, useContext, useMemo, createContext } from "react";
import { PRIMARY_LOGO, ICON_MARK } from "../../LegacyLogos";
import { docPalette } from "@/lib/docPalette";

// ─────────────────────────────────────────────────────────────
//  LEGACY RENOVATIONS, Client Estimate Signature Page
// ─────────────────────────────────────────────────────────────

const SAMPLE_ESTIMATE = {
  estimateNumber: "EST-2026-001",
  dateIssued: "June 1, 2026",
  validThrough: "July 1, 2026",
  client: {
    name: "John & Sarah Mitchell",
    address: "1842 Elmwood Drive",
    cityStateZip: "Springfield, MO 65804",
    phone: "(417) 555-0182",
    email: "mitchell@email.com",
  },
  project: {
    address: "1842 Elmwood Drive, Springfield, MO 65804",
    type: "Full Kitchen & Master Bath Renovation",
    duration: "8 - 10 Weeks",
    scopeIntro:
      "The following estimate encompasses all labor, materials, and project management required to complete a full kitchen renovation and master bathroom remodel as discussed during the on-site consultation of May 28, 2026.",
  },
  sections: [
    {
      id: "s1",
      title: "01 · Kitchen Renovation",
      items: [
        { name: "Demolition & Disposal", description: "Remove existing cabinets, countertops, flooring, and fixtures.", qty: 1, unit: "LS", amount: 1800 },
        { name: "Custom Cabinetry", description: "Semi-custom shaker-style, soft-close hardware, painted finish.", qty: 22, unit: "LF", amount: 8400 },
        { name: "Countertops - Quartz", description: "3cm quartz slab, fabrication and installation.", qty: 48, unit: "SF", amount: 3840 },
        { name: "Plumbing - Kitchen", description: "Sink, faucet, dishwasher connection, disposal installation.", qty: 1, unit: "LS", amount: 1200 },
        { name: "Electrical Rough & Finish", description: "Under-cabinet lighting, receptacle upgrades.", qty: 1, unit: "LS", amount: 2100 },
        { name: "Hardwood Flooring", description: "White oak, site-finished, subfloor prep included.", qty: 210, unit: "SF", amount: 4410 },
      ],
    },
    {
      id: "s2",
      title: "02 · Master Bathroom Remodel",
      items: [
        { name: "Demolition & Disposal", description: "Full gut including tile, vanity, shower surround, fixtures.", qty: 1, unit: "LS", amount: 1400 },
        { name: "Walk-In Shower", description: "Custom tile shower, linear drain, frameless glass enclosure.", qty: 1, unit: "LS", amount: 7200 },
        { name: "Vanity & Countertop", description: "60 double-sink vanity, quartz top, undermount sinks.", qty: 1, unit: "LS", amount: 3600 },
        { name: "Floor & Wall Tile", description: "Heated floor mat, porcelain floor tile, accent wall tile.", qty: 1, unit: "LS", amount: 3800 },
      ],
    },
    {
      id: "s3",
      title: "03 · General & Project Management",
      items: [
        { name: "Project Management", description: "Dedicated PM, weekly updates, vendor coordination.", qty: 1, unit: "LS", amount: 2800 },
        { name: "Permits & Inspections", description: "Building, mechanical, and electrical permits.", qty: 1, unit: "LS", amount: 680 },
      ],
    },
  ],
  contingencyPct: 5,
  paymentSchedule: [
    "25% due at project start to secure scheduling and materials.",
    "Progress draws due at substantial completion of each major project phase.",
    "Final balance due upon project completion and client walkthrough.",
  ],
  terms:
    "This estimate is valid for 30 days from date of issue. Prices are subject to change based on material availability. Any work outside the defined scope will be presented as a written change order prior to commencement.",
  status: "pending",
  signedBy: null,
  signedAt: null,
};

const fmt = (n) =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sectionTotal = (sec) => sec.items.reduce((s, i) => s + Number(i.amount), 0);

const formatTimestamp = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
};

// Fixed status colors (success/error) that don't follow the brand.
const STATUS = { green: "#2d5a27", greenLight: "#edf5ec", red: "#7a2020", redLight: "#fdf0f0" };
const LEGACY_C = { ...docPalette(null, null), ...STATUS };
// Per-tenant document palette, provided by the main component. Sub-components read it here so the
// client-facing estimate follows the tenant's brand (dark on-brand text, brand accent on rules).
const PaletteCtx = createContext(LEGACY_C);

const Label = ({ children, style = {} }) => {
  const C = useContext(PaletteCtx);
  return (
    <div style={{ fontSize:11, fontWeight:500, letterSpacing:"0.18em",
      textTransform:"uppercase", color:C.oliveLight, marginBottom:8, ...style }}>
      {children}
    </div>
  );
};

const Rule = ({ style = {} }) => {
  const C = useContext(PaletteCtx);
  return <hr style={{ border:"none", borderTop:`1px solid ${C.rule}`, margin:"24px 0", ...style }} />;
};

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
          <tr style={{ borderBottom:`1.5px solid ${C.oliveMid}` }}>
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
                <td colSpan={5} style={{ background:C.cream, fontSize:10, fontWeight:500, letterSpacing:"0.18em", textTransform:"uppercase", color:C.oliveMid, padding:"8px", borderBottom:"none" }}>{sec.title}</td>
              </tr>
              {sec.items.map((item, i) => (
                <tr key={sec.id + i} style={{ borderBottom:`0.5px solid ${C.creamDark}` }}>
                  <td style={{ fontFamily:"'Butler', serif", fontSize:15, width:"30%" }}>{item.name}</td>
                  <td style={{ fontSize:12, color:C.oliveLight, width:"35%", lineHeight:1.5 }}>{item.description}</td>
                  <td style={{ textAlign:"center", color:C.oliveMid, width:"8%" }}>{item.qty}</td>
                  <td style={{ textAlign:"center", color:C.oliveMid, width:"8%" }}>{item.unit}</td>
                  <td style={{ textAlign:"right", whiteSpace:"nowrap", width:"14%" }}>{fmt(item.amount)}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <div className="lr-mobile-cards">
        {sections.map((sec) => (
          <div key={sec.id}>
            <div className="lr-section-header">{sec.title}</div>
            {sec.items.map((item, i) => (
              <div key={sec.id + i} className="lr-item-card">
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

function Totals({ estimate }) {
  const C = useContext(PaletteCtx);
  const lineSubtotal = estimate.sections.reduce((s, sec) => s + sectionTotal(sec), 0);
  // Total from the saved estimate (authoritative, includes the GC fee). Derive the
  // fee as the difference so the on-page arithmetic (subtotal + fee = total) is exact.
  const total = estimate.grandTotal != null ? estimate.grandTotal : lineSubtotal;
  const gcAmount = estimate.gcFeeEnabled ? Math.max(0, total - lineSubtotal) : 0;
  const gcLabel = estimate.gcFeeLabel || "GC / Project Management Fee";

  return (
    <div style={{ display:"flex", justifyContent:"flex-end", margin:"8px 0 0" }}>
      <div style={{ width: "100%", maxWidth:380 }}>
        {estimate.sections.map((sec) => (
          <div key={sec.id} style={{ display:"flex", justifyContent:"space-between",
            padding:"6px 0", borderBottom:`0.5px solid ${C.creamDark}`,
            fontSize:13, color:C.oliveMid }}>
            <span>{sec.title.replace(/^\d+\s·\s/, "")} Subtotal</span>
            <span>{fmt(sectionTotal(sec))}</span>
          </div>
        ))}
        {gcAmount > 0 && (
          <div style={{ display:"flex", justifyContent:"space-between",
            padding:"6px 0", borderBottom:`0.5px solid ${C.creamDark}`,
            fontSize:13, color:C.oliveMid }}>
            <span>{gcLabel}{estimate.gcFeePct ? ` (${estimate.gcFeePct}%)` : ""}</span>
            <span>{fmt(gcAmount)}</span>
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"space-between",
          padding:"10px 0", marginTop:2,
          borderTop:`2px solid ${C.accent}`, borderBottom:`2px solid ${C.accent}`,
          fontFamily:"'Butler', serif", fontSize:18, color:C.olive }}>
          <span>Total Estimate</span><span>{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}

function SignedBanner({ estimate }) {
  const C = useContext(PaletteCtx);
  return (
    <div style={{ background:C.greenLight, border:`1.5px solid ${C.green}`,
      borderRadius:6, padding:"20px 24px", marginTop:32 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
        <span style={{ fontSize:20 }}>✓</span>
        <span style={{ fontWeight:600, fontSize:16, color:C.green }}>Estimate Accepted</span>
      </div>
      <div style={{ fontSize:13, color:C.green, lineHeight:1.7 }}>
        <strong>Signed by:</strong> {estimate.signedBy}<br />
        <strong>Accepted on:</strong> {formatTimestamp(estimate.signedAt)}<br />
        <strong>Estimate:</strong> {estimate.estimateNumber}
      </div>
      <div style={{ marginTop:12, fontSize:12, color:C.oliveLight }}>
        A copy of this accepted estimate has been recorded. {estimate.branding?.company_name || "Legacy Renovations"} will be in touch shortly to confirm your project start date.
      </div>
    </div>
  );
}

function SignaturePanel({ estimate, onSave }) {
  const C = useContext(PaletteCtx);
  const [name, setName]           = useState("");
  const [agreed, setAgreed]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [nameError, setNameError] = useState("");

  const clientFirstName = estimate.client.name.split(" ")[0];
  const isValid = name.trim().length >= 3 && agreed;

  const handleSubmit = async () => {
    if (name.trim().length < 3) { setNameError("Please enter your full name to sign."); return; }
    if (!agreed) return;
    setLoading(true);
    setError("");
    const payload = {
      estimateId: estimate.estimateNumber,
      signedBy:   name.trim(),
      signedAt:   new Date().toISOString(),
      status:     "accepted",
    };
    try {
      if (onSave) await onSave(payload);
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      setError("Something went wrong saving your signature. Please try again or contact us.");
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  return (
    <div style={{ marginTop:40, background:C.cream,
      border:`1.5px solid ${C.rule}`, borderRadius:6, padding:"28px 32px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:4 }}>
        <img src={ICON_MARK} alt="" style={{ height:28, opacity:0.7 }} />
        <div style={{ fontFamily:"'Butler', serif", fontSize:20, color:C.olive, letterSpacing:"0.06em" }}>
          Accept This Estimate
        </div>
      </div>
      <div style={{ fontSize:13, color:C.oliveLight, marginBottom:24, lineHeight:1.6 }}>
        Hi {clientFirstName}, please review the estimate above, then type your full name below to accept.
      </div>

      <Rule style={{ margin:"0 0 24px" }} />

      <Label>Your Full Name (Electronic Signature)</Label>
      <input
        type="text"
        placeholder="Type your full legal name"
        value={name}
        onChange={(e) => { setName(e.target.value); setNameError(""); }}
        style={{
          width:"100%", maxWidth:400,
          fontFamily:"'Pinyon Script', cursive",
          fontSize:22, color:C.olive,
          border:"none", borderBottom:`2px solid ${nameError ? C.red : C.oliveMid}`,
          background:"transparent", outline:"none",
          padding:"8px 0", marginBottom: nameError ? 6 : 16,
          letterSpacing:"0.04em",
        }}
      />
      {nameError && <div style={{ fontSize:12, color:C.red, marginBottom:12 }}>{nameError}</div>}

      {name.trim().length >= 2 && (
        <div style={{ marginBottom:20, padding:"10px 16px",
          background:C.warmWhite, border:`1px solid ${C.rule}`, borderRadius:4,
          display:"inline-block", minWidth:260 }}>
          <div style={{ fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase",
            color:C.oliveLight, marginBottom:6 }}>Signature Preview</div>
          <div style={{ fontFamily:"'Pinyon Script', cursive",
            fontSize:28, color:C.olive, letterSpacing:"0.02em" }}>{name}</div>
          <div style={{ borderTop:`1px solid ${C.rule}`, marginTop:6, paddingTop:4,
            fontSize:10, color:C.oliveLight }}>
            {new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}
          </div>
        </div>
      )}

      <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:24 }}>
        <input type="checkbox" id="agree" checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ marginTop:3, accentColor:C.olive, width:16, height:16, cursor:"pointer" }} />
        <label htmlFor="agree" style={{ fontSize:13, color:C.oliveMid, lineHeight:1.6, cursor:"pointer" }}>
          By checking this box and typing my name above, I confirm that I have read and agree to the full estimate, scope of work, payment schedule, and terms outlined by {estimate.branding?.company_name || "Legacy Renovations"}.
        </label>
      </div>

      {error && (
        <div style={{ background:C.redLight, border:`1px solid ${C.red}`,
          borderRadius:4, padding:"10px 14px", fontSize:13, color:C.red, marginBottom:16 }}>
          {error}
        </div>
      )}

      <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
        <button onClick={handleSubmit} disabled={!isValid || loading} style={{
          background: isValid && !loading ? C.olive : "#aaa",
          color:"#f7f4ee", border:"none", padding:"12px 32px", fontSize:12,
          letterSpacing:"0.2em", textTransform:"uppercase",
          cursor: isValid && !loading ? "pointer" : "not-allowed",
          fontFamily:"'Highway Gothic', sans-serif", borderRadius:2, transition:"background 0.2s",
        }}>
          {loading ? "Saving..." : "Accept & Sign Estimate"}
        </button>
        <button onClick={() => {
          const title = `${estimate.estimateNumber}_${estimate.client.name.replace(/\s+/g,'_')}_Signed_${new Date().toISOString().slice(0,10)}`;
          const prev = document.title;
          document.title = title;
          window.print();
          setTimeout(() => { document.title = prev; }, 1000);
        }} style={{
          background:"transparent", color:C.oliveLight,
          border:`1px solid ${C.rule}`, padding:"12px 24px", fontSize:12,
          letterSpacing:"0.18em", textTransform:"uppercase",
          cursor:"pointer", fontFamily:"'Highway Gothic', sans-serif", borderRadius:2,
        }}>
          Save PDF
        </button>
      </div>

      {estimate.branding?.website && (
        <div style={{ marginTop:16, fontSize:11, color:C.oliveLight, lineHeight:1.6 }}>
          Questions? Visit{" "}
          <a href={estimate.branding.website.startsWith("http") ? estimate.branding.website : `https://${estimate.branding.website}`} style={{ color:C.oliveLight }}>
            {estimate.branding.website}
          </a>
        </div>
      )}
    </div>
  );
}

export default function LegacyEstimateClient({ estimate = SAMPLE_ESTIMATE, onSave }) {
  const [localEstimate, setLocalEstimate] = useState(estimate);

  useEffect(() => { setLocalEstimate(estimate); }, [estimate]);

  const handleSave = async (payload) => {
    if (onSave) await onSave(payload);
    setLocalEstimate((prev) => ({
      ...prev,
      status:   "accepted",
      signedBy: payload.signedBy,
      signedAt: payload.signedAt,
    }));
  };

  const isSigned = localEstimate.status === "accepted";

  // Per-tenant branding from the public RPC. Fallbacks stay empty (never another tenant's details);
  // company_name/logo fall back to Legacy only for the standalone sample preview.
  const b = localEstimate.branding || {};
  const companyName = b.company_name || "Legacy Renovations";
  const logoUrl = b.logo_url || PRIMARY_LOGO;
  const website = b.website || "";
  const cityState = (b.city_state_zip || "").replace(/,?\s*\d{5}(-\d{4})?$/, "");
  const established = b.established_label || "";
  const C = useMemo(() => ({ ...docPalette(b.brand_primary, b.brand_accent), ...STATUS }), [b.brand_primary, b.brand_accent]);

  return (
   <PaletteCtx.Provider value={C}>
    <div style={{ background:"#e8e3d8", minHeight:"100vh",
      fontFamily:"'Highway Gothic', sans-serif", color:C.olive }}>

      <style>{`
        /* Match the in-app estimate preview exactly: Butler (headings), Highway Gothic (body),
           Pinyon Script (signature). These live in the staff component's own style block, so the
           public page must load them itself or it falls back to different system fonts. */
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

      <div className="no-print" style={{ background:C.warmWhite,
        borderBottom:`1px solid ${C.rule}`, padding:"14px 32px",
        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <img src={logoUrl} alt={companyName} style={{ height:36 }} />
        <div style={{ fontSize:11, letterSpacing:"0.16em", textTransform:"uppercase", color:C.oliveLight }}>
          Estimate {localEstimate.estimateNumber}
          {isSigned && (
            <span style={{ marginLeft:12, background:C.greenLight, color:C.green,
              padding:"3px 10px", borderRadius:12, fontSize:10, fontWeight:500 }}>
              ✓ Accepted
            </span>
          )}
        </div>
      </div>

      <div className="lr-client-wrap" style={{ maxWidth:860, margin:"0 auto", padding:"40px 24px 80px" }}>
        <div style={{ background:C.warmWhite, borderRadius:6, padding:"32px 36px",
          boxShadow:"0 2px 20px rgba(0,0,0,0.08)", marginBottom:2 }}>
          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"flex-start", paddingBottom:20,
            borderBottom:`1.5px solid ${C.rule}`, marginBottom:24 }}>
            <img src={logoUrl} alt={companyName} style={{ height:56 }} />
            <div style={{ textAlign:"right", fontSize:12, color:C.oliveLight,
              letterSpacing:"0.06em", lineHeight:1.9 }}>
              <div style={{ fontFamily:"'Butler', serif", fontSize:26, color:C.olive,
                letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:4 }}>
                Estimate
              </div>
              <div style={{ fontSize:11 }}>No. {localEstimate.estimateNumber}</div>
              Date Issued: {localEstimate.dateIssued}<br />
              Valid Through: {localEstimate.validThrough}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 40px", marginBottom:24 }}>
            <div>
              <Label>Prepared For</Label>
              <div style={{ fontFamily:"'Butler', serif", fontSize:15, lineHeight:1.6 }}>
                {localEstimate.client.name}<br />
                {localEstimate.client.address}<br />
                {localEstimate.client.cityStateZip}
              </div>
            </div>
            <div>
              <Label>Project</Label>
              <div style={{ fontSize:14, lineHeight:1.7, color:C.oliveMid }}>
                <strong style={{ color:C.olive }}>{localEstimate.project.type}</strong><br />
                {localEstimate.project.address}<br />
                Duration: {localEstimate.project.duration}
              </div>
            </div>
          </div>

          <div style={{ fontFamily:"'Butler', serif", fontStyle:"italic",
            fontSize:14, color:C.oliveMid, lineHeight:1.8,
            padding:"14px 18px", background:C.cream, borderLeft:`2px solid ${C.rule}`,
            marginBottom:28 }}>
            {localEstimate.project.scopeIntro}
          </div>

          <LineTable sections={localEstimate.sections} />
        </div>

        <div style={{ background:C.warmWhite, borderRadius:6, padding:"24px 36px",
          boxShadow:"0 2px 20px rgba(0,0,0,0.08)", marginTop:2, marginBottom:2 }}>
          <Totals estimate={localEstimate} />
        </div>

        <div style={{ background:C.warmWhite, borderRadius:6, padding:"28px 36px",
          boxShadow:"0 2px 20px rgba(0,0,0,0.08)", marginTop:2 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 40px" }}>
            <div>
              <Label>Payment Schedule</Label>
              {localEstimate.paymentSchedule.map((line, i) => (
                <div key={i} style={{ display:"flex", gap:10, marginBottom:10,
                  fontSize:13, color:C.oliveMid, lineHeight:1.5 }}>
                  <span style={{ color:C.rule, fontWeight:700, marginTop:1 }}>·</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
            <div>
              <Label>Terms & Conditions</Label>
              <div style={{ fontSize:13, color:C.oliveMid, lineHeight:1.7 }}>
                {localEstimate.terms}
              </div>
            </div>
          </div>
        </div>

        {isSigned
          ? <SignedBanner estimate={localEstimate} />
          : <SignaturePanel estimate={localEstimate} onSave={handleSave} />
        }

        <div style={{ marginTop:40, textAlign:"center",
          fontSize:11, letterSpacing:"0.14em", textTransform:"uppercase",
          color:C.oliveLight, lineHeight:2, borderTop:`1px solid ${C.rule}`, paddingTop:20 }}>
          <img src={ICON_MARK} alt="" style={{ height:22, opacity:0.4,
            display:"block", margin:"0 auto 8px" }} />
          {[website, cityState, established].filter(Boolean).map((part, i, arr) => (
            <span key={i}>{part}{i < arr.length - 1 ? <>&nbsp;·&nbsp;</> : null}</span>
          ))}
          <div style={{ fontSize:8.5, letterSpacing:"0.1em", color:C.rule, marginTop:6, textTransform:"none" }}>
            Presented with GuildWright
          </div>
        </div>
      </div>
    </div>
   </PaletteCtx.Provider>
  );
}