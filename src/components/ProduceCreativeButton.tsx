"use client";
import { useState } from "react";
import { produceCreativeAction } from "@/lib/actions/creativeProductionActions";

const PRODUCTION_METHOD_LABELS: Record<string, string> = {
  REUSE: "Reuse existing material",
  REDESIGN: "Redesign existing material",
  REMIX: "Remix existing components",
};

export default function ProduceCreativeButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof produceCreativeAction>> | null>(null);

  async function handleProduce() {
    setLoading(true);
    setError(null);
    const res = await produceCreativeAction(productId);
    if (!res.success) {
      setError(res.error ?? "Something went wrong producing this creative.");
      setLoading(false);
      return;
    }
    setResult(res);
    setLoading(false);
  }

  if (result?.previewUrl) {
    return (
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "22px", marginBottom: "16px" }}>
        <h3 style={{ fontSize: "11px", fontWeight: 700, color: "#22d3ee", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 14px" }}>
          JARVIS Creative
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>
            <strong style={{ color: "#e2e8f0" }}>Production method:</strong> {PRODUCTION_METHOD_LABELS[result.spec?.productionMethod ?? ""] ?? result.spec?.productionMethod}
          </div>
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>
            <strong style={{ color: "#e2e8f0" }}>AI image generations:</strong> {result.spec?.costEvidence.imageGenerationCalls ?? 0}
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.previewUrl}
          alt="Produced creative"
          style={{ width: "100%", maxWidth: "440px", borderRadius: "12px", border: "1px solid #1e293b", display: "block" }}
        />

        <p style={{ fontSize: "12px", color: "#64748b", marginTop: "14px", marginBottom: 0 }}>
          This creative is now saved and ready for your review before it can be published.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "24px", textAlign: "center" }}>
      <button
        onClick={handleProduce}
        disabled={loading}
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px", fontWeight: 700, color: "#080b12",
          background: loading ? "#1e293b" : "#22d3ee", padding: "12px 22px", borderRadius: "9px", border: "none",
          cursor: loading ? "default" : "pointer", fontFamily: "inherit",
        }}
      >
        {loading ? "Producing..." : "Produce Creative"}
      </button>
      {error && (
        <p style={{ fontSize: "12px", color: "#f87171", marginTop: "10px" }}>{error}</p>
      )}
    </div>
  );
}