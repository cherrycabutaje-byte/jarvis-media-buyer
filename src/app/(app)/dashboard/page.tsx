import Link from "next/link";

export default function DashboardPage() {
  return (
    <div style={{ padding: "32px 28px 60px", maxWidth: "980px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#f1f5f9", margin: "0 0 8px" }}>Dashboard</h1>
        <p style={{ fontSize: "15px", color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>
          What can I do with JARVIS?
        </p>
      </div>

      <Link
        href="/media-buyer"
        style={{
          display: "block", textDecoration: "none", position: "relative", overflow: "hidden",
          background: "#0f172a", border: "1px solid #1e293b", borderRadius: "18px", padding: "28px",
          maxWidth: "480px",
        }}
        className="jarvis-product-card"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <span style={{ position: "relative", width: "8px", height: "8px", borderRadius: "50%", background: "#22d3ee", display: "inline-block" }} className="jarvis-pulse-dot" />
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#22d3ee", letterSpacing: "0.08em", textTransform: "uppercase" }}>Active product</span>
        </div>
        <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#f1f5f9", margin: "0 0 10px" }}>JARVIS Media Buyer</h2>
        <p style={{ fontSize: "14px", color: "#94a3b8", margin: "0 0 20px", lineHeight: 1.6 }}>
          AI-powered advertising intelligence, creative development and publishing.
        </p>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#080b12",
          background: "#22d3ee", padding: "9px 16px", borderRadius: "9px",
        }}>
          Open Media Buyer
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </span>
      </Link>

      <style>{`
        .jarvis-product-card { transition: border-color 0.2s; }
        .jarvis-product-card:hover { border-color: #334155; }
        .jarvis-pulse-dot::after {
          content: ""; position: absolute; inset: 0; border-radius: 50%; background: #22d3ee;
          animation: jarvis-pulse 2s ease-out infinite;
        }
        @keyframes jarvis-pulse {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .jarvis-pulse-dot::after { animation: none; }
        }
      `}</style>
    </div>
  );
}