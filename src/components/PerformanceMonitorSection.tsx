"use client";
import { useState } from "react";
import { getPerformanceSummaryAction, type PerformanceSummaryResult } from "@/lib/actions/performanceSummaryActions";

export interface PerformanceMonitorSectionProps {
  brandId: string;
}

function fmt(value: number | null, decimals = 2): string {
  return value === null ? "-" : value.toFixed(decimals);
}

/**
 * Performance Monitor V1 UI - factual numbers only. Explicitly does
 * NOT show healthy/weak/winning/losing/fatigue/pause/scale/
 * recommendation language, or color-coded good/bad signals.
 */
export default function PerformanceMonitorSection({ brandId }: PerformanceMonitorSectionProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PerformanceSummaryResult | null>(null);

  async function handleLoad() {
    setLoading(true);
    const today = new Date();
    const currentEnd = today.toISOString().slice(0, 10);
    const currentStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const previousEnd = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const previousStart = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const summary = await getPerformanceSummaryAction(
      brandId,
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd }
    );
    setResult(summary);
    setLoading(false);
  }

  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e293b" };
  const labelStyle: React.CSSProperties = { fontSize: "13px", color: "#94a3b8" };
  const valueStyle: React.CSSProperties = { fontSize: "13px", color: "#e2e8f0", fontFamily: "monospace" };

  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px", marginTop: "16px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", margin: "0 0 4px" }}>Performance changes</h3>
      <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px" }}>Diagnosis not performed yet.</p>

      <button
        onClick={handleLoad}
        disabled={loading}
        style={{
          fontSize: "13px", fontWeight: 700, color: "#080b12", background: "#22d3ee",
          border: "none", borderRadius: "9px", padding: "10px 18px", cursor: loading ? "default" : "pointer", fontFamily: "inherit",
        }}
      >
        {loading ? "Loading..." : "Load performance changes"}
      </button>

      {result && !result.success && <p style={{ fontSize: "13px", color: "#f87171", marginTop: "12px" }}>{result.error}</p>}

      {result?.success && (
        <div style={{ marginTop: "16px" }}>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 4px" }}>
            Current: {result.currentPeriod?.start} to {result.currentPeriod?.end}
          </p>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 4px" }}>
            Previous: {result.previousPeriod?.start} to {result.previousPeriod?.end}
          </p>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px", fontFamily: "monospace" }}>
            Status: {result.monitor?.status}
          </p>

          <div style={rowStyle}>
            <span style={labelStyle}>Spend</span>
            <span style={valueStyle}>
              {fmt(result.previous?.totalSpend ?? null)} &rarr; {fmt(result.current?.totalSpend ?? null)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Impressions</span>
            <span style={valueStyle}>
              {fmt(result.previous?.totalImpressions ?? null, 0)} &rarr; {fmt(result.current?.totalImpressions ?? null, 0)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Clicks</span>
            <span style={valueStyle}>
              {fmt(result.previous?.totalClicks ?? null, 0)} &rarr; {fmt(result.current?.totalClicks ?? null, 0)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>CTR</span>
            <span style={valueStyle}>
              {fmt(result.previous?.averageCtr ?? null)}% &rarr; {fmt(result.current?.averageCtr ?? null)}%
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>CPC</span>
            <span style={valueStyle}>
              {fmt(result.previous?.averageCpc ?? null)} &rarr; {fmt(result.current?.averageCpc ?? null)}
            </span>
          </div>
          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <span style={labelStyle}>Results</span>
            <span style={valueStyle}>
              {fmt(result.previous?.totalResults ?? null, 0)} &rarr; {fmt(result.current?.totalResults ?? null, 0)}
            </span>
          </div>

          {result.current?.observationCount === 0 && result.previous?.observationCount === 0 && (
            <p style={{ fontSize: "12px", color: "#facc15", marginTop: "12px" }}>
              No synced observations exist yet for either period. Run &quot;Verify &amp; Sync Advertising Data&quot; above first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
