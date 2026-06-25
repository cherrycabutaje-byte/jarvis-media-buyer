"use client";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import jsPDF from "jspdf";

const LANGUAGES = [
  { code: "English", label: "English" },
  { code: "Tagalog", label: "Tagalog" },
  { code: "Spanish", label: "Espanol" },
  { code: "French", label: "Francais" },
  { code: "German", label: "Deutsch" },
  { code: "Portuguese", label: "Portugues" },
  { code: "Italian", label: "Italiano" },
  { code: "Japanese", label: "Japanese" },
  { code: "Chinese Simplified", label: "Chinese" },
  { code: "Arabic", label: "Arabic" },
];

const UI_TEXT: Record<string, any> = {
  English: {
    title: "JARVIS",
    headline: "Find The Real Reason Your Campaign Is Not Converting",
    subheadline: "Stop wasting money fixing the wrong problem. JARVIS analyzes your ads, landing page, offer, messaging, and funnel to identify the actual bottleneck -- then gives you the exact fix to test next.",
    tabPaste: "Paste Content",
    tabUrl: "Paste URL",
    placeholder: "Paste your landing page, ad copy, offer, sales page, or campaign data...",
    urlPlaceholder: "https://yourlandingpage.com",
    fetchBtn: "Fetch Page",
    fetching: "Fetching...",
    fetchSuccess: "Page fetched successfully!",
    languageLabel: "Report Language:",
    analyzeBtn: "Analyze My Campaign",
    analyzingBtn: "Analyzing...",
    loadingTitle: "JARVIS Intelligence Engine Running",
    loadingSteps: [
      "Running Consumer Psychologist Analysis...",
      "Running Media Buyer Analysis...",
      "Running Growth Strategist Analysis...",
      "Running Offer Strategist Analysis...",
      "JARVIS is synthesizing all expert findings...",
    ],
    reportTitle: "JARVIS Marketing Report",
    reportSubtitle: "Find The Real Reason Your Campaign Is Not Converting",
    downloadBtn: "Download PDF",
  },
  Tagalog: {
    title: "JARVIS",
    headline: "Alamin ang Tunay na Dahilan Kung Bakit Hindi Nagko-Convert ang Iyong Kampanya",
    subheadline: "Tigilan na ang pag-aaksaya ng pera sa maling problema. Sinusuri ng JARVIS ang iyong mga ads, landing page, offer, mensahe, at funnel para mahanap ang tunay na bottleneck.",
    tabPaste: "I-paste ang Content",
    tabUrl: "I-paste ang URL",
    placeholder: "I-paste ang iyong landing page, ad copy, offer, sales page, o impormasyon ng kampanya...",
    urlPlaceholder: "https://iyonglangingpage.com",
    fetchBtn: "I-fetch ang Page",
    fetching: "Nagfe-fetch...",
    fetchSuccess: "Matagumpay na na-fetch ang page!",
    languageLabel: "Wika ng Ulat:",
    analyzeBtn: "Suriin ang Aking Kampanya",
    analyzingBtn: "Sinusuri...",
    loadingTitle: "Tumatakbo ang JARVIS Intelligence Engine",
    loadingSteps: [
      "Isinasagawa ang Pagsusuri ng Consumer Psychologist...",
      "Isinasagawa ang Pagsusuri ng Media Buyer...",
      "Isinasagawa ang Pagsusuri ng Growth Strategist...",
      "Isinasagawa ang Pagsusuri ng Offer Strategist...",
      "Pinagsasama-sama ng JARVIS ang lahat ng natuklasan...",
    ],
    reportTitle: "Ulat ng JARVIS Marketing",
    reportSubtitle: "Ang Tunay na Dahilan Kung Bakit Hindi Nagko-Convert ang Iyong Kampanya",
    downloadBtn: "I-download ang PDF",
  },
};

function splitVerdictAndReport(text: string) {
  const verdictMatch = text.match(/(## JARVIS VERDICT[\s\S]*?---\n)([\s\S]*)/);
  if (verdictMatch) {
    return {
      verdict: verdictMatch[1].replace(/---\n$/, "").trim(),
      report: verdictMatch[2].trim(),
    };
  }
  return { verdict: "", report: text };
}

export default function AnalyzePage() {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"paste" | "url">("paste");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMessage, setFetchMessage] = useState("");
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("Auto-Detect");
  const [loadingStep, setLoadingStep] = useState(0);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [showEmailCapture, setShowEmailCapture] = useState(false);

  const t = UI_TEXT[language] || UI_TEXT["English"];

  useEffect(() => {
    if (!loading) { setLoadingStep(0); return; }
    let step = 0;
    setLoadingStep(0);
    function advance() {
      step += 1;
      if (step < t.loadingSteps.length) {
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
        setFetchMessage(t.fetchSuccess);
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
        body: JSON.stringify({ input, language }),
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
        body: JSON.stringify({ email, language }),
      });
      const data = await response.json();
      if (data.success) {
        setEmailSubmitted(true);
        downloadPDF();
      }
    } catch (err) {
      console.error(err);
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

    const lines = analysis.split("\n");
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
        const clean = line.replace(/^> /, "").replace(/\*\*/g, "");
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
        const clean = line.replace(/\*\*/g, "").replace(/\*/g, "");
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
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        <div className="flex items-center justify-between mb-8">
          <a href="/" className="text-3xl font-extrabold text-cyan-700">JARVIS</a>
          <a href="/" className="text-slate-500 text-sm hover:text-slate-700">Back to Home</a>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
          {t.headline}
        </h2>
        <p className="text-slate-600 text-base mb-8">{t.subheadline}</p>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("paste")}
            className={"px-5 py-2 rounded-lg font-medium text-sm transition-colors " + (activeTab === "paste" ? "bg-cyan-500 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}
          >
            {t.tabPaste}
          </button>
          <button
            onClick={() => setActiveTab("url")}
            className={"px-5 py-2 rounded-lg font-medium text-sm transition-colors " + (activeTab === "url" ? "bg-cyan-500 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}
          >
            {t.tabUrl}
          </button>
        </div>

        {activeTab === "paste" ? (
          <div>
            {fetchMessage && (
              <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {fetchMessage}
              </div>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full h-48 border border-slate-300 rounded-lg p-3 sm:p-4 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              placeholder={t.placeholder}
            />
          </div>
        ) : (
          <div>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg p-3 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                placeholder={t.urlPlaceholder}
              />
              <button
                onClick={fetchUrl}
                disabled={fetching || !url.trim()}
                className="px-5 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors whitespace-nowrap"
              >
                {fetching ? t.fetching : t.fetchBtn}
              </button>
            </div>
            <p className="text-slate-400 text-xs mt-2">Paste a landing page, sales page, or ad URL and JARVIS will fetch the content automatically.</p>
          </div>
        )}

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-500 text-sm">Language:</span>
            <span className="bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-semibold px-3 py-1 rounded-full">Auto-Detect</span>
            <span className="text-slate-400 text-xs">JARVIS detects your input language automatically</span>
          </div>
          <button
            onClick={analyze}
            disabled={loading || !input.trim()}
            className="w-full sm:w-auto px-6 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
          >
            {loading ? t.analyzingBtn : t.analyzeBtn}
          </button>
        </div>

        {loading && (
          <div className="mt-6 bg-slate-900 rounded-xl p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
              <p className="text-cyan-400 font-semibold text-sm sm:text-base">{t.loadingTitle}</p>
            </div>
            <div className="space-y-3">
              {t.loadingSteps.map((step: string, index: number) => (
                <div key={index} className="flex items-center gap-3">
                  <div className={"w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 " + (index < loadingStep ? "bg-cyan-500" : index === loadingStep ? "bg-cyan-500 animate-pulse" : "bg-slate-700")}>
                    {index < loadingStep ? (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className={"w-2 h-2 rounded-full " + (index === loadingStep ? "bg-white" : "bg-slate-600")}></div>
                    )}
                  </div>
                  <span className={"text-sm " + (index < loadingStep ? "text-slate-400 line-through" : index === loadingStep ? "text-white font-medium" : "text-slate-600")}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {analysis && (
          <div className="mt-8 sm:mt-10 w-full border border-slate-200 rounded-xl overflow-hidden shadow-lg bg-white">
            <div className="bg-cyan-500 text-white p-4 sm:p-6">
              <h2 className="text-xl sm:text-3xl font-bold">{t.reportTitle}</h2>
              <p className="mt-1 sm:mt-2 opacity-90 text-sm sm:text-base">{t.reportSubtitle}</p>
              <span className="mt-2 inline-block text-xs bg-white bg-opacity-20 px-2 py-1 rounded">{language}</span>
            </div>

            {verdict && (
              <div className="bg-slate-900 text-white p-4 sm:p-6 border-b border-slate-700">
                <div className="prose prose-invert max-w-none prose-h2:text-cyan-400 prose-h2:text-base prose-h2:font-bold prose-h2:mb-3 prose-h2:mt-0 prose-blockquote:border-l-4 prose-blockquote:border-cyan-400 prose-blockquote:pl-3 prose-blockquote:not-italic prose-blockquote:text-slate-200 prose-strong:text-white">
                  <ReactMarkdown>{verdict}</ReactMarkdown>
                </div>
              </div>
            )}

            <div className="p-4 sm:p-8">
              <div className="prose prose-slate max-w-none prose-sm sm:prose-base prose-h1:text-xl prose-h1:font-bold prose-h1:text-cyan-600 prose-h1:border-b prose-h1:border-cyan-200 prose-h1:pb-2 prose-h1:mt-6 prose-h2:text-lg prose-h2:font-bold prose-h2:text-slate-800 prose-h2:mt-4 prose-strong:text-slate-900 prose-p:text-slate-700 prose-p:leading-relaxed prose-li:text-slate-700 prose-hr:border-slate-200">
                <ReactMarkdown>{report}</ReactMarkdown>
              </div>
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t">
                {!emailSubmitted ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                    <h3 className="text-slate-800 font-bold text-base mb-1">Download Your Full PDF Report</h3>
                    <p className="text-slate-500 text-sm mb-4">Enter your email to download the report and get notified of new JARVIS features.</p>
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                      />
                      <button
                        onClick={submitEmail}
                        disabled={emailLoading || !email.trim()}
                        className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors whitespace-nowrap"
                      >
                        {emailLoading ? "Saving..." : "Download PDF"}
                      </button>
                    </div>
                    <p className="text-slate-400 text-xs mt-2">No spam. Unsubscribe anytime.</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-green-600 text-sm font-medium">Email saved! Your PDF is downloading.</p>
                    <button onClick={downloadPDF} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium text-sm transition-colors">
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
}