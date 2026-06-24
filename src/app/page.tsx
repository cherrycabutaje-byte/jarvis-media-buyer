export default function Home() {
  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto">
      <h1 className="text-4xl font-bold mb-8">
        JARVIS Media Buyer Intelligence
      </h1>

      <textarea
        className="w-full h-64 border rounded-lg p-4"
        placeholder="Paste campaign data, ad copy, landing page copy, competitor ads, or marketing information..."
      />

      <button className="mt-4 px-6 py-3 bg-black text-white rounded-lg">
        Analyze
      </button>

      <div className="mt-10 border rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">
          JARVIS Report
        </h2>

        <p>
          Results will appear here.
        </p>
      </div>
    </main>
  );
}