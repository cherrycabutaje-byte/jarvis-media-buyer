import { writeFileSync } from "fs";
const content = `"use client";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import jsPDF from "jspdf";
import Link from "next/link";

function splitVerdictAndReport(text) {
  const verdictMatch = text.match(/(## JARVIS VERDICT[\\s\\S]*?---\\n)([\\s\\S]*)/);
  if (verdictMatch) {
    return {
      verdict: verdictMatch[1].replace(/---\\n$/, "").trim(),
      report: verdictMatch[2].trim(),
    };
  }
  return { verdict: "", report: text };
}

export default function AnalyzePage() {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [activeTab, setActiveTab] = useState("paste");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMessage, setFetchMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [mode, setMode] = useState("full");

  const loadingSteps = [
    "Running Consumer Psychologist Analysis...",
    "Running Media Buyer Analysis...",
    "Running Growth Strategist Analysis...",
    "Running Offer Strategist Analysis...",
    "JARVIS is synthesizing all expert findings...",
  ];

  useEffect(() => {
    if (!loading) { setLoadingStep(0); return; }
    let step = 0;
    setLoadingStep(0);
    function advance() {
      step += 1;
      if (step < loadingSteps.length) {
        setLoadingStep(step);
        timer = setTimeout(advance, 8000);
      }
    }
    let timer = setTimeout(advance, 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  async function fetchUrl() {
    if (!url.trim()) return;
    try {
      setFetching(true);
      setFetchMessage("");
      setError("");
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setInput(data.content);
        setFetchMessage("Page fetched successfully!");
        setActiveTab("paste");
      }
    } catch (err) {
      setError("Failed to fetch the page. Please paste the content manually.");
    } finally {
      setFetching(false);
    }
  }

  async function analyze() {
    if (!input.trim()) return;
    try {
      setLoading(true);
      setError("");
      setAnalysis("");
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, language: "Auto-Detect", mode }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setAnalysis(data.result);
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitEmail() {
    if (!email.trim() || !email.includes("@")) return;
    try {
      setEmailLoading(true);
      const response = await fetch("/api/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, language: "Auto-Detect" }),
      });
      const data = await response.json();
      if (data.success) {
        setEmailSubmitted(true);
        downloadPDF();
      }
    } catch (err) {
      downloadPDF();
    } finally {
      setEmailLoading(false);
    }
  }

  function downloadPDF() {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;
    doc.setFillColor(6, 182, 212);
    doc.rect(0, 0, pageWidth, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("JARVIS Marketing Report", margin, 18);
    y = 40;
    doc.setTextColor(30, 30, 30);
    const lines = analysis.split("\\n");
    for (const line of lines) {
      if (y > 270) { doc.addPage(); y = 20; }
      if (line.startsWith("# ")) {
        y += 4;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(6, 182, 212);
        doc.text(line.replace("# ", ""), margin, y);
        y += 2;
        doc.setDrawColor(6, 182, 212);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 6;
        doc.setTextColor(30, 30, 30);
      } else if (line.startsWith("## ")) {
        y += 3;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(6, 182, 212);
        doc.text(line.replace("## ", ""), margin, y);
        y += 6;
        doc.setTextColor(30, 30, 30);
      } else if (line.startsWith("> ")) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bolditalic");
        const clean = line.replace(/^> /, "").replace(/\\*\\*/g, "");
        const wrapped = doc.splitTextToSize(clean, maxWidth - 10);
        for (const wline of wrapped) {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(wline, margin + 5, y);
          y += 5;
        }
      } else if (line.trim() === "" || line.trim() === "---") {
        y += 3;
      } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 30);
        const clean = line.replace(/\\*\\*/g, "").replace(/\\*/g, "");
        const wrapped = doc.splitTextToSize(clean, maxWidth);
        for (const wline of wrapped) {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(wline, margin, y);
          y += 5;
        }
      }
    }
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Generated by JARVIS Marketing Intelligence", margin, 290);
    doc.save("jarvis-report.pdf");
  }

  const { verdict, report } = splitVerdictAndReport(analysis);

  return (
    <main className="min-h-screen bg-slate-950">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-12 py-4 border-b border-slate-800">
        <Link href="/" className="text-2xl font-extrabold text-cyan-400">JARVIS</Link>
        <Link href="/" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Back to Home</Link>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="inline-block border border-cyan-500 border-opacity-40 text-cyan-400 text-xs font-semibold px-4 py-1 rounded-full mb-4 tracking-widest uppercase">
            Marketing Intelligence
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            Analyze Your Campaign
          </h1>
          <p className="text-slate-400 text-base sm:text-lg">
            Paste your campaign data or URL. JARVIS runs 4 specialist analyses and tells you exactly what to fix.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode("quick")}
            className={"p-4 rounded-xl border-2 text-left transition-all " + (mode === "quick" ? "border-cyan-500 bg-cyan-500 bg-opacity-10" : "border-slate-700 bg-slate-900 hover:border-slate-600")}
          >
            <div className={"font-bold text-sm mb-1 " + (mode === "quick" ? "text-cyan-400" : "text-slate-300")}>Quick Report</div>
            <div className="text-xs text-slate-500">~500 words · 15-20 seconds</div>
          </button>
          <button
            onClick={() => setMode("full")}
            className={"p-4 rounded-xl border-2 text-left transition-all " + (mode === "full" ? "border-cyan-500 bg-cyan-500 bg-opacity-10" : "border-slate-700 bg-slate-900 hover:border-slate-600")}
          >
            <div className={"font-bold text-sm mb-1 " + (mode === "full" ? "text-cyan-400" : "text-slate-300")}>Full Report</div>
            <div className="text-xs text-slate-500">~900 words · 40 seconds</div>
          </button>
        </div>

        {/* Input Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-6">

          {/* Tabs */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveTab("paste")}
              className={"flex-1 py-3 text-sm font-medium transition-colors " + (activeTab === "paste" ? "text-cyan-400 border-b-2 border-cyan-400 bg-slate-800" : "text-slate-500 hover:text-slate-300")}
            >
              Paste Content
            </button>
            <button
              onClick={() => setActiveTab("url")}
              className={"flex-1 py-3 text-sm font-medium transition-colors " + (activeTab === "url" ? "text-cyan-400 border-b-2 border-cyan-400 bg-slate-800" : "text-slate-500 hover:text-slate-300")}
            >
              Paste URL
            </button>
          </div>

          <div className="p-5">
            {activeTab === "paste" ? (
              <div>
                {fetchMessage && (
                  <div className="mb-3 p-3 bg-green-900 bg-opacity-50 border border-green-700 rounded-lg text-green-400 text-sm">
                    {fetchMessage}
                  </div>
                )}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="w-full h-48 bg-slate-800 border border-slate-700 rounded-xl p-4 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-500 resize-none"
                  placeholder="Paste your landing page, ad copy, offer, sales page, or campaign data..."
                />
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl p-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-500"
                    placeholder="https://yourlandingpage.com"
                  />
                  <button
                    onClick={fetchUrl}
                    disabled={fetching || !url.trim()}
                    className="px-5 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-xl font-medium text-sm transition-colors whitespace-nowrap"
                  >
                    {fetching ? "Fetching..." : "Fetch Page"}
                  </button>
                </div>
                <p className="text-slate-500 text-xs mt-2">Paste a landing page URL and JARVIS will fetch the content automatically.</p>
              </div>
            )}
          </div>

          {/* Bottom Bar */}
          <div className="px-5 py-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
              <span className="text-slate-400 text-xs">Auto-Detect Language</span>
              <span className="text-slate-600 text-xs">· Works in any language</span>
            </div>
            <button
              onClick={analyze}
              disabled={loading || !input.trim()}
              className="w-full sm:w-auto px-8 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors text-sm"
            >
              {loading ? "Analyzing..." : "Analyze My Campaign"}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
              <p className="text-cyan-400 font-semibold text-sm">JARVIS Intelligence Engine Running</p>
            </div>
            <div className="space-y-3">
              {loadingSteps.map((step, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className={"w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 " + (index < loadingStep ? "bg-cyan-500" : index === loadingStep ? "bg-cyan-500 animate-pulse" : "bg-slate-800 border border-slate-700")}>
                    {index < loadingStep ? (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className={"w-2 h-2 rounded-full " + (index === loadingStep ? "bg-white" : "bg-slate-600")}></div>
                    )}
                  </div>
                  <span className={"text-sm " + (index < loadingStep ? "text-slate-500 line-through" : index === loadingStep ? "text-white font-medium" : "text-slate-600")}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-900 bg-opacity-30 border border-red-800 rounded-xl text-red-400 text-sm">{error}</div>
        )}

        {/* Report */}
        {analysis && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">

            {/* Report Header */}
            <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 p-6">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span className="text-white text-xs font-semibold tracking-widest uppercase">Intelligence Report</span>
              </div>
              <h2 className="text-2xl font-bold text-white">JARVIS Marketing Report</h2>
              <p className="text-cyan-100 text-sm mt-1">Find The Real Reason Your Campaign Is Not Converting</p>
            </div>

            {/* Verdict */}
            {verdict && (
              <div className="bg-slate-950 p-6 border-b border-slate-800">
                <div className="prose prose-invert max-w-none
                  prose-h2:text-cyan-400 prose-h2:text-base prose-h2:font-bold prose-h2:mb-3 prose-h2:mt-0
                  prose-blockquote:border-l-4 prose-blockquote:border-cyan-500 prose-blockquote:pl-4 prose-blockquote:not-italic
                  prose-blockquote:text-slate-300 prose-strong:text-white prose-p:text-slate-300">
                  <ReactMarkdown>{verdict}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Full Report */}
            <div className="p-6 sm:p-8">
              <div className="prose prose-invert max-w-none prose-sm sm:prose-base
                prose-h1:text-xl prose-h1:font-bold prose-h1:text-cyan-400 prose-h1:border-b prose-h1:border-slate-700 prose-h1:pb-2 prose-h1:mt-8
                prose-h2:text-lg prose-h2:font-bold prose-h2:text-slate-200 prose-h2:mt-6
                prose-strong:text-white
                prose-p:text-slate-300 prose-p:leading-relaxed
                prose-li:text-slate-300
                prose-hr:border-slate-700">
                <ReactMarkdown>{report}</ReactMarkdown>
              </div>

              {/* Email Capture */}
              <div className="mt-8 pt-6 border-t border-slate-800">
                {!emailSubmitted ? (
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                    <h3 className="text-white font-bold text-base mb-1">Download Your Full PDF Report</h3>
                    <p className="text-slate-400 text-sm mb-4">Enter your email to download and get notified of new JARVIS features.</p>
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-500"
                      />
                      <button
                        onClick={submitEmail}
                        disabled={emailLoading || !email.trim()}
                        className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors whitespace-nowrap"
                      >
                        {emailLoading ? "Saving..." : "Download PDF"}
                      </button>
                    </div>
                    <p className="text-slate-500 text-xs mt-2">No spam. Unsubscribe anytime.</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-slate-800 rounded-xl p-4">
                    <p className="text-green-400 text-sm font-medium">Email saved! Your PDF is downloading.</p>
                    <button onClick={downloadPDF} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium text-sm transition-colors">
                      Download Again
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}`;
writeFileSync("src/app/analyze/page.tsx", content, "utf8");
console.log("Done");
