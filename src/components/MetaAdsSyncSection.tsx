"use client";
import { useState } from "react";
import { syncMetaAdsObservations } from "@/lib/actions/metaAdsSyncActions";

export interface MetaAdsSyncSectionProps {
  brandId: string;
}

/**
 * TRUTHFUL WORDING: never claims "verified" or "synced" until a
 * genuine successful read has actually occurred. Shows only factual
 * counts/metrics - never any judgment word.
 */
export default function MetaAdsSyncSection({ brandId }: MetaAdsSyncSectionProps) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    error: string | null;
    accountName: string | null;
    campaignsCount: number;
    adSetsCount: number;
    adsCount: number;
    observationsCount: number;
  } | null>(null);

  async function handleSync() {
    setSyncing(true);
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since = thirtyDaysAgo.toISOString().slice(0, 10);
    const until = today.toISOString().slice(0, 10);

    const syncResult = await syncMetaAdsObservations(brandId, { since, until });
    setResult(syncResult);
    setSyncing(false);
  }

  return (
    <div style={{ marginTop: "16px" }}>
      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          fontSize: "13px", fontWeight: 700, color: "#080b12", background: "#22d3ee",
          border: "none", borderRadius: "9px", padding: "10px 18px", cursor: syncing ? "default" : "pointer", fontFamily: "inherit",
        }}
      >
        {syncing ? "Verifying & syncing..." : "Verify & Sync Advertising Data"}
      </button>

      {result && (
        <div style={{ marginTop: "14px", padding: "14px 16px", background: "#080b12", border: "1px solid #1e293b", borderRadius: "10px" }}>
          {result.success ? (
            <div>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "#4ade80", margin: "0 0 8px" }}>Meta access verified</p>
              <p style={{ fontSize: "13px", color: "#e2e8f0", margin: "0 0 4px" }}>Account: {result.accountName ?? "(name not returned)"}</p>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 2px" }}>Campaigns: {result.campaignsCount}</p>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 2px" }}>Ad sets: {result.adSetsCount}</p>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 2px" }}>Ads: {result.adsCount}</p>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>Observations recorded: {result.observationsCount}</p>
            </div>
          ) : (
            <p style={{ fontSize: "13px", color: "#f87171", margin: 0 }}>{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
