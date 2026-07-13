"use client";
import { useState } from "react";
import Link from "next/link";
import { createFirstAssetFromJobAction } from "@/lib/actions/assetActions";

export default function NewAssetPage() {
  const [jobId, setJobId] = useState("");
  const [productId, setProductId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleCreate() {
    if (!jobId.trim()) {
      setError("Job ID is required.");
      return;
    }
    if (!productId.trim()) {
      setError("Product ID is required.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const result = await createFirstAssetFromJobAction(jobId, productId);
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
          <h1 style={{fontSize: "32px", fontWeight: "800", color: "#ffffff", marginBottom: "12px"}}>Create First Asset</h1>
          <p style={{color: "#94a3b8", fontSize: "16px", lineHeight: "1.6"}}>Persists a succeeded job&apos;s result as version 1 of this product&apos;s asset. Only supports a product&apos;s first asset - regeneration is a future slice.</p>
        </div>

        {success ? (
          <div style={{background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px", color: "#e2e8f0"}}>
            <p style={{color: "#22d3ee", fontWeight: "700", margin: 0}}>Asset created successfully!</p>
          </div>
        ) : (
          <div style={{background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px"}}>
            <div style={{marginBottom: "20px"}}>
              <label style={{display: "block", color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "8px"}}>JOB ID</label>
              <input value={jobId} onChange={e => setJobId(e.target.value)} style={{width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 14px", color: "#e2e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box"}} placeholder="Paste the succeeded job's ID" />
            </div>
            <div style={{marginBottom: "24px"}}>
              <label style={{display: "block", color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "8px"}}>PRODUCT ID</label>
              <input value={productId} onChange={e => setProductId(e.target.value)} style={{width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 14px", color: "#e2e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box"}} placeholder="Paste the product ID" />
            </div>
            {error && <div style={{marginBottom: "20px", padding: "14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", color: "#f87171"}}>{error}</div>}
            <button onClick={handleCreate} disabled={loading} style={{width: "100%", padding: "14px", background: loading ? "#1e293b" : "#22d3ee", color: loading ? "#475569" : "#080b12", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: loading ? "default" : "pointer"}}>
              {loading ? "Creating..." : "Create First Asset"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}