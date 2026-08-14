import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import LegacyEstimateClient from "@/components/estimation/LegacyEstimateClient";
import { Loader2 } from "lucide-react";

// Adapts a Base44 Estimate record into the shape LegacyEstimateClient expects
function adaptEstimate(est) {
  const sections = (est.sections || []).map((sec, si) => ({
    id: sec.id || `s${si}`,
    title: sec.name || `Section ${si + 1}`,
    items: (sec.line_items || []).map((item, ii) => ({
      name: item.description || item.cost_code || `Item ${ii + 1}`,
      description: item.item_description || "",
      qty: item.quantity ?? 1,
      unit: item.unit || "LS",
      amount: item.line_total || 0,
    })),
  }));

  const dateIssued = est.created_date
    ? new Date(est.created_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const validThrough = (() => {
    const d = new Date(est.created_date || Date.now());
    d.setDate(d.getDate() + 30);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  })();

  return {
    estimateNumber: est.estimate_number || (est.id ? est.id.slice(-8).toUpperCase() : "EST-0001"),
    dateIssued,
    validThrough,
    client: {
      name: est.client_name || "Valued Client",
      address: est.client_address || "",
      cityStateZip: est.client_city_state_zip || "",
    },
    project: {
      address: est.project_name || "",
      type: est.title || "Project Estimate",
      duration: "",
      scopeIntro: est.client_intro || "",
    },
    sections,
    gcFeeEnabled: est.gc_fee_enabled,
    gcFeePct: est.gc_fee_pct,
    gcFeeLabel: est.gc_fee_label,
    grandTotal: est.grand_total,
    paymentSchedule: (est.branding?.payment_schedule?.length ? est.branding.payment_schedule : [
      "25% due at project start to secure scheduling and materials.",
      "Progress draws due at substantial completion of each major project phase.",
      "Final balance due upon project completion and client walkthrough.",
    ]),
    terms:
      est.branding?.estimate_terms ||
      "This estimate is valid for 30 days from date of issue. Prices are subject to change based on material availability. Any work outside the defined scope will be presented as a written change order prior to commencement.",
    status: est.signed_at ? "accepted" : "pending",
    signedBy: est.signed_by || null,
    signedAt: est.signed_at || null,
    branding: est.branding || null,
    _estimateId: est.id,
  };
}

export default function ClientEstimate() {
  const params = new URLSearchParams(window.location.search);
  const estimateId = params.get("id");

  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!estimateId) {
      setError("No estimate ID provided.");
      setLoading(false);
      return;
    }
    base44.functions.invoke("getPublicEstimate", { estimateId })
      .then(res => {
        if (res.data?.error) {
          setError(res.data.error);
        } else {
          setEstimate(adaptEstimate(res.data.estimate));
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Estimate not found.");
        setLoading(false);
      });
  }, [estimateId]);

  const handleSave = async (payload) => {
    await base44.functions.invoke("saveEstimateSignature", {
      estimateId,
      signedBy: payload.signedBy,
      signedAt: payload.signedAt,
    });
    setEstimate(prev => ({ ...prev, status: "accepted", signedBy: payload.signedBy, signedAt: payload.signedAt }));
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#e8e3d8" }}>
        <Loader2 style={{ width: 32, height: 32, animation: "spin 1s linear infinite", color: "#3d3d1e" }} />
      </div>
    );
  }

  if (error || !estimate) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#e8e3d8", fontFamily: "sans-serif", color: "#3d3d1e" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Estimate Not Found</div>
          <div style={{ fontSize: 14, color: "#8a8a52" }}>{error || "This estimate link may be expired or invalid."}</div>
        </div>
      </div>
    );
  }

  return <LegacyEstimateClient estimate={estimate} onSave={handleSave} />;
}