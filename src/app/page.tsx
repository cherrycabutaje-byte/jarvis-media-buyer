"use client";

import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function analyze() {
    try {
      setLoading(true);

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input,
        }),
      });

      const data = await response.json();

      setResult(data.result);
    } catch (error) {
      console.error(error);
      setResult("Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto">
      <h1 className="text-4xl font-bold mb-8">
        JARVIS Media Buyer Intelligence
      </h1>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="w-full h-64 border rounded-lg p-4"
        placeholder="Paste campaign data, ad copy, landing page copy, competitor ads, or marketing information..."
      />

      <button
        onClick={analyze}
        disabled={loading}
        className="mt-4 px-6 py-3 bg-black text-white rounded-lg"
      >
        {loading ? "Analyzing..." : "Analyze"}
      </button>

      <div className="mt-10 border rounded-lg p-6 whitespace-pre-wrap">
        <h2 className="text-2xl font-semibold mb-4">
          JARVIS Report
        </h2>

        {result || "Results will appear here."}
      </div>
    </main>
  );
}