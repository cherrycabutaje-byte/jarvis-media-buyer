"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { connectMetaAdAccountAction, disconnectMetaAdAccountAction } from "@/lib/actions/metaAdAccountActions";

export interface MetaAdAccountConnectionProps {
  brandId: string;
  connected: boolean;
  metaAdAccountId: string | null;
  status: string | null;
  lastSyncedAt: string | null;
}

export default function MetaAdAccountConnection({ brandId, connected, metaAdAccountId }: MetaAdAccountConnectionProps) {
  const router = useRouter();
  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setSaving(true);
    setError(null);
    const result = await connectMetaAdAccountAction({
      brandId,
      metaAdAccountId: adAccountId,
      metaBusinessId: null,
      accessToken,
    });
    if (result.success) {
      setAccessToken("");
      router.refresh();
    } else {
      setError(result.error ?? "Something went wrong connecting this account.");
    }
    setSaving(false);
  }

  async function handleDisconnect() {
    setSaving(true);
    setError(null);
    const result = await disconnectMetaAdAccountAction(brandId);
    if (result.success) {
      router.refresh();
    } else {
      setError(result.error ?? "Something went wrong disconnecting this account.");
    }
    setSaving(false);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #1e293b",
    background: "#080b12", color: "#e2e8f0", fontSize: "14px", fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "12px", fontWeight: 700, color: "#64748b", marginBottom: "6px", display: "block",
  };

  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px", marginTop: "16px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", margin: "0 0 4px" }}>Meta Ads account (read-only)</h3>
      <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 20px", lineHeight: 1.5 }}>
        Store your ad account ID and access token here so JARVIS can use them once reporting is available. This has not yet been verified with Meta, and JARVIS does not make changes to your Meta account or spend any money - this connection is read-only.
      </p>

      {connected ? (
        <div>
          <p style={{ fontSize: "14px", color: "#e2e8f0", margin: "0 0 6px" }}>
            Meta Ads credentials configured: <strong>{metaAdAccountId}</strong>
          </p>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 16px" }}>
            This has not yet been verified with Meta, and no data has been synced yet.
          </p>
          <button
            onClick={handleDisconnect}
            disabled={saving}
            style={{
              fontSize: "13px", fontWeight: 700, color: "#f87171", background: "transparent",
              border: "1px solid #1e293b", borderRadius: "9px", padding: "10px 18px", cursor: saving ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {saving ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "14px", maxWidth: "420px" }}>
          <div>
            <label style={labelStyle}>Ad account ID</label>
            <input type="text" value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)} placeholder="act_1234567890" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Access token</label>
            <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Paste your Meta access token" style={inputStyle} />
          </div>
          <button
            onClick={handleConnect}
            disabled={saving}
            style={{
              fontSize: "13px", fontWeight: 700, color: "#080b12", background: "#22d3ee",
              border: "none", borderRadius: "9px", padding: "10px 18px", cursor: saving ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {saving ? "Connecting..." : "Connect"}
          </button>
        </div>
      )}

      {error && <p style={{ fontSize: "12px", color: "#f87171", marginTop: "12px", marginBottom: 0 }}>{error}</p>}
    </div>
  );
}
