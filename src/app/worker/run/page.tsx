"use client";
import { useState } from "react";
import Link from "next/link";
import { runWorkerOnceAction } from "@/lib/actions/workerActions";

export default function RunWorkerPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logLines, setLogLines] = useState<string[] | null>(null);

  async function handleRun() {
    try {
      setLoading(true);
      setError("");
      setLogLines(null);
      const result = await runWorkerOnceAction();
      if (!result.success) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setLogLines(result.data?.logLines ?? []);
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
      <div style={{maxWidth: "600px", margin: "0 auto", padding: "60px 20px"}}>
        <div style={{marginBottom: "32px"}}>
          <h1 style={{fontSize: "32px", fontWeight: "800", color: "#ffffff", marginBottom: "12px"}}>Run Worker (Once)</h1>
          <p style={{color: "#94a3b8", fontSize: "16px", lineHeight: "1.6"}}>Claims and locally processes one queued job. No provider call, no asset creation - the job stays in &apos;processing&apos; until later slices implement completion.</p>
        </div>

        <div style={{background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px"}}>
          {error && <div style={{marginBottom: "20px", padding: "14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", color: "#f87171"}}>{error}</div>}
          <button onClick={handleRun} disabled={loading} style={{width: "100%", padding: "14px", background: loading ? "#1e293b" : "#22d3ee", color: loading ? "#475569" : "#080b12", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: loading ? "default" : "pointer"}}>
            {loading ? "Running..." : "Run Worker Once"}
          </button>

          {logLines !== null && (
            <div style={{marginTop: "24px", background: "#000000", borderRadius: "10px", padding: "16px", fontFamily: "monospace", fontSize: "13px", color: "#94a3b8", whiteSpace: "pre-wrap", lineHeight: "1.7"}}>
              {logLines.length === 0 ? "(no log lines)" : logLines.join("\n")}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}