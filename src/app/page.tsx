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

const UI_TEXT: Record<string, {
  title: string;
  headline: string;
  subheadline: string;
  placeholder: string;
  languageLabel: string;
  analyzeBtn: string;
  analyzingBtn: string;
  loadingTitle: string;
  loadingSteps: string[];
  reportTitle: string;
  reportSubtitle: string;
  downloadBtn: string;
}> = {
  English: {
    title: "JARVIS",
    headline: "Find The Real Reason Your Campaign Is Not Converting",
    subheadline: "Stop wasting money fixing the wrong problem. JARVIS analyzes your ads, landing page, offer, messaging, and funnel to identify the actual bottleneck -- then gives you the exact fix to test next.",
    placeholder: "Paste your landing page, ad copy, offer, sales page, or campaign data...",
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
    subheadline: "Tigilan na ang pag-aaksaya ng pera sa maling problema. Sinusuri ng JARVIS ang iyong mga ads, landing page, offer, mensahe, at funnel para mahanap ang tunay na bottleneck -- at ibibigay sa iyo ang eksaktong solusyon.",
    placeholder: "I-paste ang iyong landing page, ad copy, offer, sales page, o impormasyon ng kampanya...",
    languageLabel: "Wika ng Ulat:",
    analyzeBtn: "Suriin ang Aking Kampanya",
    analyzingBtn: "Sinusuri...",
    loadingTitle: "Tumatakbo ang JARVIS Intelligence Engine",
    loadingSteps: [
      "Isinasagawa ang Pagsusuri ng Consumer Psychologist...",
      "Isinasagawa ang Pagsusuri ng Media Buyer...",
      "Isinasagawa ang Pagsusuri ng Growth Strategist...",
      "Isinasagawa ang Pagsusuri ng Offer Strategist...",
      "Pinagsasama-sama ng JARVIS ang lahat ng natuklasan ng mga eksperto...",
    ],
    reportTitle: "Ulat ng JARVIS Marketing",
    reportSubtitle: "Ang Tunay na Dahilan Kung Bakit Hindi Nagko-Convert ang Iyong Kampanya",
    downloadBtn: "I-download ang PDF",
  },
  Spanish: {
    title: "JARVIS",
    headline: "Descubre la Verdadera Razon por la que tu Campana no Convierte",
    subheadline: "Deja de desperdiciar dinero arreglando el problema equivocado. JARVIS analiza tus anuncios, pagina de destino, oferta, mensajes y embudo para identificar el verdadero cuello de botella.",
    placeholder: "Pega tu pagina de destino, copy del anuncio, oferta, pagina de ventas o datos de la campana...",
    languageLabel: "Idioma del Informe:",
    analyzeBtn: "Analizar mi Campana",
    analyzingBtn: "Analizando...",
    loadingTitle: "Motor de Inteligencia JARVIS en Marcha",
    loadingSteps: [
      "Ejecutando Analisis del Psicologo del Consumidor...",
      "Ejecutando Analisis del Comprador de Medios...",
      "Ejecutando Analisis del Estratega de Crecimiento...",
      "Ejecutando Analisis del Estratega de Ofertas...",
      "JARVIS esta sintetizando los hallazgos de todos los expertos...",
    ],
    reportTitle: "Informe de Marketing JARVIS",
    reportSubtitle: "La Verdadera Razon por la que tu Campana no Convierte",
    downloadBtn: "Descargar PDF",
  },
  French: {
    title: "JARVIS",
    headline: "Decouvrez la Vraie Raison pour laquelle votre Campagne ne Convertit pas",
    subheadline: "Arretez de gaspiller de l'argent a resoudre le mauvais probleme. JARVIS analyse vos publicites, page de destination, offre, messages et entonnoir pour identifier le vrai goulot d'etranglement.",
    placeholder: "Collez votre page de destination, copie publicitaire, offre, page de vente ou donnees de campagne...",
    languageLabel: "Langue du Rapport:",
    analyzeBtn: "Analyser ma Campagne",
    analyzingBtn: "Analyse en cours...",
    loadingTitle: "Moteur d'Intelligence JARVIS en Cours",
    loadingSteps: [
      "Analyse du Psychologue Consommateur en cours...",
      "Analyse de l'Acheteur Media en cours...",
      "Analyse du Strategiste de Croissance en cours...",
      "Analyse du Strategiste d'Offre en cours...",
      "JARVIS synthetise les conclusions de tous les experts...",
    ],
    reportTitle: "Rapport Marketing JARVIS",
    reportSubtitle: "La Vraie Raison pour laquelle votre Campagne ne Convertit pas",
    downloadBtn: "Telecharger le PDF",
  },
  German: {
    title: "JARVIS",
    headline: "Finden Sie den wahren Grund warum Ihre Kampagne nicht konvertiert",
    subheadline: "Horen Sie auf, Geld fur das falsche Problem auszugeben. JARVIS analysiert Ihre Anzeigen, Landingpage, Angebot, Nachrichten und Funnel, um den eigentlichen Engpass zu identifizieren.",
    placeholder: "Fugen Sie Ihre Landingpage, Anzeigentext, Angebot, Verkaufsseite oder Kampagnendaten ein...",
    languageLabel: "Berichtssprache:",
    analyzeBtn: "Meine Kampagne analysieren",
    analyzingBtn: "Analysiere...",
    loadingTitle: "JARVIS Intelligence Engine lauft",
    loadingSteps: [
      "Verbraucherpsychologen-Analyse wird ausgefuhrt...",
      "Media-Buyer-Analyse wird ausgefuhrt...",
      "Wachstumsstrategen-Analyse wird ausgefuhrt...",
      "Angebotsstrategen-Analyse wird ausgefuhrt...",
      "JARVIS synthetisiert alle Expertenergebnisse...",
    ],
    reportTitle: "JARVIS Marketing-Bericht",
    reportSubtitle: "Der wahre Grund warum Ihre Kampagne nicht konvertiert",
    downloadBtn: "PDF herunterladen",
  },
  Portuguese: {
    title: "JARVIS",
    headline: "Descubra a Verdadeira Razao pela qual sua Campanha nao esta Convertendo",
    subheadline: "Pare de desperdicar dinheiro resolvendo o problema errado. O JARVIS analisa seus anuncios, pagina de destino, oferta, mensagens e funil para identificar o verdadeiro gargalo.",
    placeholder: "Cole sua pagina de destino, copy do anuncio, oferta, pagina de vendas ou dados da campanha...",
    languageLabel: "Idioma do Relatorio:",
    analyzeBtn: "Analisar Minha Campanha",
    analyzingBtn: "Analisando...",
    loadingTitle: "Motor de Inteligencia JARVIS em Execucao",
    loadingSteps: [
      "Executando Analise do Psicologo do Consumidor...",
      "Executando Analise do Comprador de Midia...",
      "Executando Analise do Estrategista de Crescimento...",
      "Executando Analise do Estrategista de Ofertas...",
      "JARVIS esta sintetizando as descobertas de todos os especialistas...",
    ],
    reportTitle: "Relatorio de Marketing JARVIS",
    reportSubtitle: "A Verdadeira Razao pela qual sua Campanha nao esta Convertendo",
    downloadBtn: "Baixar PDF",
  },
  Italian: {
    title: "JARVIS",
    headline: "Scopri il Vero Motivo per cui la tua Campagna non Converte",
    subheadline: "Smetti di sprecare denaro risolvendo il problema sbagliato. JARVIS analizza i tuoi annunci, landing page, offerta, messaggi e funnel per identificare il vero collo di bottiglia.",
    placeholder: "Incolla la tua landing page, copy dell'annuncio, offerta, pagina di vendita o dati della campagna...",
    languageLabel: "Lingua del Rapporto:",
    analyzeBtn: "Analizza la mia Campagna",
    analyzingBtn: "Analisi in corso...",
    loadingTitle: "Motore di Intelligenza JARVIS in Esecuzione",
    loadingSteps: [
      "Esecuzione Analisi dello Psicologo del Consumatore...",
      "Esecuzione Analisi del Media Buyer...",
      "Esecuzione Analisi dello Stratega della Crescita...",
      "Esecuzione Analisi dello Stratega dell'Offerta...",
      "JARVIS sta sintetizzando i risultati di tutti gli esperti...",
    ],
    reportTitle: "Rapporto Marketing JARVIS",
    reportSubtitle: "Il Vero Motivo per cui la tua Campagna non Converte",
    downloadBtn: "Scarica PDF",
  },
  Japanese: {
    title: "JARVIS",
    headline: "????????????????????????????",
    subheadline: "???????????????????????????JARVIS??????????????????????????????????????????????????????",
    placeholder: "???????????????????????????????????????????????????...",
    languageLabel: "??????:",
    analyzeBtn: "???????????",
    analyzingBtn: "???...",
    loadingTitle: "JARVIS???????????????",
    loadingSteps: [
      "?????????????...",
      "??????????????...",
      "???????????...",
      "?????????????...",
      "JARVIS?????????????????...",
    ],
    reportTitle: "JARVIS???????????",
    reportSubtitle: "????????????????????",
    downloadBtn: "PDF???????",
  },
  "Chinese Simplified": {
    title: "JARVIS",
    headline: "?????????????????",
    subheadline: "??????????????JARVIS???????????????????,???????,????????????????????",
    placeholder: "?????????????????????????...",
    languageLabel: "????:",
    analyzeBtn: "????????",
    analyzingBtn: "???...",
    loadingTitle: "JARVIS???????",
    loadingSteps: [
      "?????????????...",
      "???????????...",
      "???????????...",
      "???????????...",
      "JARVIS???????????...",
    ],
    reportTitle: "JARVIS????",
    reportSubtitle: "???????????????",
    downloadBtn: "??PDF",
  },
  Arabic: {
    title: "JARVIS",
    headline: "????? ????? ??????? ???? ????? ?????",
    subheadline: "???? ?? ????? ????? ?? ????? ??????? ???????. ???? JARVIS ???????? ?????? ???????? ????? ??????? ????? ?????? ???????? ??????.",
    placeholder: "???? ????? ???????? ?? ???? ??????? ?? ????? ?? ???? ???????? ?? ?????? ??????...",
    languageLabel: "??? ???????:",
    analyzeBtn: "????? ?????",
    analyzingBtn: "???? ???????...",
    loadingTitle: "???? ???? JARVIS ????",
    loadingSteps: [
      "????? ????? ???? ??? ????????...",
      "????? ????? ????? ???????...",
      "????? ????? ????????? ?????...",
      "????? ????? ????????? ??????...",
      "???? JARVIS ?????? ????? ???? ???????...",
    ],
    reportTitle: "????? ????? JARVIS",
    reportSubtitle: "????? ??????? ???? ????? ?????",
    downloadBtn: "????? PDF",
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

export default function Home() {
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("English");
  const [loadingStep, setLoadingStep] = useState(0);

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
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
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
        doc.setTextColor(30, 30, 30);
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

        <h1 className="text-4xl sm:text-5xl font-extrabold text-cyan-700">{t.title}</h1>
        <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 mt-4 sm:mt-6">
          {t.headline}
        </h2>
        <p className="text-slate-600 text-base sm:text-xl mt-3 sm:mt-4 mb-6 sm:mb-8">
          {t.subheadline}
        </p>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full h-40 sm:h-48 border border-slate-300 rounded-lg p-3 sm:p-4 text-slate-800 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-sky-400"
          placeholder={t.placeholder}
        />

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <label className="text-slate-600 text-sm font-medium whitespace-nowrap">
              {t.languageLabel}
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
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
              <p className="text-cyan-400 font-semibold text-sm sm:text-base">
                {t.loadingTitle}
              </p>
            </div>
            <div className="space-y-3">
              {t.loadingSteps.map((step, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    index < loadingStep ? "bg-cyan-500" : index === loadingStep ? "bg-cyan-500 animate-pulse" : "bg-slate-700"
                  }`}>
                    {index < loadingStep ? (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className={`w-2 h-2 rounded-full ${index === loadingStep ? "bg-white" : "bg-slate-600"}`}></div>
                    )}
                  </div>
                  <span className={`text-sm ${
                    index < loadingStep ? "text-slate-400 line-through" : index === loadingStep ? "text-white font-medium" : "text-slate-600"
                  }`}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {analysis && (
          <div className="mt-8 sm:mt-10 w-full border border-slate-200 rounded-xl overflow-hidden shadow-lg bg-white">
            <div className="bg-cyan-500 text-white p-4 sm:p-6">
              <h2 className="text-xl sm:text-3xl font-bold">{t.reportTitle}</h2>
              <p className="mt-1 sm:mt-2 opacity-90 text-sm sm:text-base">{t.reportSubtitle}</p>
              <span className="mt-2 inline-block text-xs bg-white bg-opacity-20 px-2 py-1 rounded">
                {language}
              </span>
            </div>

            {verdict && (
              <div className="bg-slate-900 text-white p-4 sm:p-6 border-b border-slate-700">
                <div className="prose prose-invert max-w-none
                  prose-h2:text-cyan-400 prose-h2:text-base prose-h2:font-bold prose-h2:mb-3 prose-h2:mt-0
                  prose-blockquote:border-l-4 prose-blockquote:border-cyan-400 prose-blockquote:pl-3 prose-blockquote:not-italic
                  prose-blockquote:text-slate-200 prose-strong:text-white">
                  <ReactMarkdown>{verdict}</ReactMarkdown>
                </div>
              </div>
            )}

            <div className="p-4 sm:p-8">
              <div className="prose prose-slate max-w-none prose-sm sm:prose-base
                prose-h1:text-xl prose-h1:font-bold prose-h1:text-cyan-600 prose-h1:border-b prose-h1:border-cyan-200 prose-h1:pb-2 prose-h1:mt-6
                prose-h2:text-lg prose-h2:font-bold prose-h2:text-slate-800 prose-h2:mt-4
                prose-strong:text-slate-900
                prose-p:text-slate-700 prose-p:leading-relaxed
                prose-li:text-slate-700
                prose-hr:border-slate-200">
                <ReactMarkdown>{report}</ReactMarkdown>
              </div>
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t flex justify-end">
                <button
                  onClick={downloadPDF}
                  className="w-full sm:w-auto px-5 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
                >
                  {t.downloadBtn}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
