"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

export default function HookGeneratorPage() {
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [benefit, setBenefit] = useState("");
  const [tone, setTone] = useState("Direct");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tones = ["Direct", "Emotional", "Curiosity", "Urgent", "Contrarian", "Humorous"];

  async function generate() {
    if (!product.trim()) return;
    try {
      setLoading(true); setError(""); setResult("");
      const res = await fetch("/api/generate-hooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product, audience, benefit, tone }) });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data.result);
    } catch { setError("Something went wrong."); }
    finally { setLoading(false); }
  }

  return (
    <main style={{background: "#080b12", minHeight: "100vh"}}>
      <nav style={{borderBottom: "1px solid #1e293b", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        <Link href="/" style={{fontSize: "22px", fontWeight: "800", color: "#22d3ee", textDecoration: "none"}}>JARVIS</Link>
        <div style={{display: "flex", gap: "20px"}}>
          <Link href="/analyze" style={{fontSize: "13px", color: "#64748b", textDecoration: "none"}}>Campaign</Link>
          <Link href="/facebook-ad" style={{fontSize: "13px", color: "#64748b", textDecoration: "none"}}>FB Ads</Link>
          <Link href="/competitor-spy" style={{fontSize: "13px", color: "#64748b", textDecoration: "none"}}>Competitor Spy</Link>
          <Link href="/" style={{fontSize: "13px", color: "#64748b", textDecoration: "none"}}>Home</Link>
        </div>
      </nav>
      <div style={{maxWidth: "800px", margin: "0 auto", padding: "40px 20px"}}>
        <div style={{marginBottom: "32px"}}>
          <div style={{display: "inline-block", border: "1px solid rgba(234,179,8,0.4)", color: "#eab308", fontSize: "11px", fontWeight: "700", padding: "4px 14px", borderRadius: "20px", marginBottom: "16px", letterSpacing: "2px"}}>HOOK GENERATOR</div>
          <h1 style={{fontSize: "32px", fontWeight: "800", color: "#ffffff", marginBottom: "12px"}}>Generate 10 Scroll-Stopping Hooks</h1>
          <p style={{color: "#94a3b8", fontSize: "16px", lineHeight: "1.6"}}>Enter your product and audience. JARVIS generates 10 hooks with psychological triggers and performance predictions.</p>
        </div>
        <div style={{background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px", marginBottom: "24px"}}>
          <div style={{marginBottom: "20px"}}>
            <label style={{display: "block", color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "8px"}}>YOUR PRODUCT</label>
            <input value={product} onChange={e => setProduct(e.target.value)} style={{width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 14px", color: "#e2e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box"}} placeholder="e.g. Online fitness program for Filipino moms" />
          </div>
          <div style={{marginBottom: "20px"}}>
            <label style={{display: "block", color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "8px"}}>TARGET AUDIENCE</label>
            <input value={audience} onChange={e => setAudience(e.target.value)} style={{width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 14px", color: "#e2e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box"}} placeholder="e.g. Filipino women 28-45 who want to lose weight" />
          </div>
          <div style={{marginBottom: "20px"}}>
            <label style={{display: "block", color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "8px"}}>KEY BENEFIT</label>
            <input value={benefit} onChange={e => setBenefit(e.target.value)} style={{width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 14px", color: "#e2e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", boxSizing: "border-box"}} placeholder="e.g. Lose weight without giving up rice in 30 days" />
          </div>
          <div style={{marginBottom: "24px"}}>
            <label style={{display: "block", color: "#94a3b8", fontSize: "13px", fontWeight: "600", marginBottom: "8px"}}>TONE</label>
            <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
              {tones.map(t => (
                <button key={t} onClick={() => setTone(t)} style={{padding: "8px 16px", borderRadius: "8px", border: tone === t ? "2px solid #eab308" : "2px solid #334155", background: tone === t ? "rgba(234,179,8,0.1)" : "#1e293b", color: tone === t ? "#eab308" : "#94a3b8", fontSize: "13px", fontWeight: "600", cursor: "pointer"}}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button onClick={generate} disabled={loading || !product.trim()} style={{width: "100%", padding: "14px", background: !product.trim() ? "#1e293b" : "#ca8a04", color: !product.trim() ? "#475569" : "white", border: "none", borderRadius: "10px", fontWeight: "700", fontSize: "15px", cursor: "pointer"}}>
            {loading ? "Generating Hooks..." : "Generate 10 Hooks"}
          </button>
        </div>
        {loading && <div style={{background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px", marginBottom: "24px", color: "#eab308", fontWeight: "600"}}>JARVIS is generating your hooks...</div>}
        {error && <div style={{marginBottom: "24px", padding: "14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", color: "#f87171"}}>{error}</div>}
        {result && (
          <div style={{background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", overflow: "hidden"}}>
            <div style={{background: "linear-gradient(135deg, #78350f, #ca8a04)", padding: "24px 28px"}}>
              <h2 style={{fontSize: "24px", fontWeight: "800", color: "white", margin: 0}}>Your 10 Scroll-Stopping Hooks</h2>
              <p style={{color: "rgba(255,255,255,0.7)", fontSize: "14px", marginTop: "6px"}}>Generated by JARVIS Hook Intelligence</p>
            </div>
            <div style={{padding: "28px"}}>
              <div className="prose prose-invert max-w-none prose-h1:text-xl prose-h1:font-bold prose-h1:text-yellow-400 prose-h1:border-b prose-h1:border-slate-700 prose-h1:pb-2 prose-h1:mt-8 prose-h2:text-lg prose-h2:font-bold prose-h2:text-yellow-400 prose-h2:mt-6 prose-h3:text-base prose-h3:font-bold prose-h3:text-slate-200 prose-strong:text-white prose-p:text-slate-300 prose-p:leading-relaxed prose-li:text-slate-300">
                <ReactMarkdown>{result}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}