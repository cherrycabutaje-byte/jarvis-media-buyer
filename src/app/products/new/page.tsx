"use client";
import { useState } from "react";
import Link from "next/link";
import { createProductAction } from "@/lib/actions/productActions";

const PRODUCT_TYPES = [
  "static-advertisement",
  "video-advertisement",
  "carousel-advertisement",
  "story-advertisement",
  "landing-page",
  "email-campaign",
  "google-ads",
  "instagram-campaign",
];

export default function NewProductPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [brainRunId, setBrainRunId] = useState("");
  const [productType, setProductType] = useState(PRODUCT_TYPES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleCreate() {
    if (!workspaceId.trim()) {
      setError("Workspace ID is required.");
      return;
    }
    if (!brandId.trim()) {
      setError("Brand ID is required.");
      return;
    }
    if (!brainRunId.trim()) {
      setError("Brain Run ID is required.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const result = await createProductAction(workspaceId, brandId, brainRunId, productType);
      if (!result.success) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{background: "#080b12", minHeight: "100vh"}}>
      <nav style={{borderBottom: "1px solid #1e293b", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        <Link href="/" style={{fontSize: "22px", fontWeight: "800", color: "#22d3ee", textDecoration: "none"}}>JARVIS</Link>
        <Link href="/" style={{fontSize: "13px", color: "#64748b", textDecoration: "none"}}>Home</Link>
      </nav>
      <div style={{maxWidth: "440px", margin: "0 auto", padding: "60px 20px"}}>
        <div style={{marginBottom: "32px"}}>
          <h1 style={{fontSize: "32px", fontWeight: "800", color: "#ffffff", marginBottom: "12px"}}>Create a Product</h1>
          <p style={{color: "#94a3b8", fontSize: "16px", lineHeight: "1.6"}}>Products are built from a completed Brain analysis. The Builder Layer will populate its content in a future step.</p>
        </div>

        {success ? (
          <div style={{background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px", color: "#e2e8f0"}}>
            <p style={{color: "#22d3ee", fontWeight: "700", margin: 0}}>Product created successfully!</p>
          </div>
        ) : (
          <div style={{background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px"}}>
            <div style={{marginBottom: "20px"}}>
              <label style={{display: "block", color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "8px"}}>WORKSPACE ID</label>
              <input value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} style={{width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 14px", color: "#e2e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box"}} placeholder="Paste your workspace ID" />
            </div>
            <div style={{marginBottom: "20px"}}>
              <label style={{display: "block", color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "8px"}}>BRAND ID</label>
              <input value={brandId} onChange={e => setBrandId(e.target.value)} style={{width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 14px", color: "#e2e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box"}} placeholder="Paste your brand ID" />
            </div>
            <div style={{marginBottom: "20px"}}>
              <label style={{display: "block", color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "8px"}}>BRAIN RUN ID</label>
              <input value={brainRunId} onChange={e => setBrainRunId(e.target.value)} style={{width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 14px", color: "#e2e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box"}} placeholder="Paste the brain_run ID" />
            </div>
            <div style={{marginBottom: "24px"}}>
              <label style={{display: "block", color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "8px"}}>PRODUCT TYPE</label>
              <select value={productType} onChange={e => setProductType(e.target.value)} style={{width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 14px", color: "#e2e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box"}}>
                {PRODUCT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            {error && <div style={{marginBottom: "20px", padding: "14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", color: "#f87171"}}>{error}</div>}
            <button onClick={handleCreate} disabled={loading} style={{width: "100%", padding: "14px", background: loading ? "#1e293b" : "#22d3ee", color: loading ? "#475569" : "#080b12", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: loading ? "default" : "pointer"}}>
              {loading ? "Creating..." : "Create Product"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}