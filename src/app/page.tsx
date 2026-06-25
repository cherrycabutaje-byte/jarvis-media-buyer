import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gray-900 text-white">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-12 py-5 border-b border-slate-800">
        <span className="text-2xl font-extrabold text-cyan-400">JARVIS</span>
        <Link
          href="/analyze"
          className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium text-sm transition-colors"
        >
          Try It Free
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 pt-20 sm:pt-32 pb-16 text-center">
        <div className="inline-block bg-transparent border border-cyan-400 text-cyan-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-widest uppercase">
          Marketing Intelligence System
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold leading-tight text-white mb-6 drop-shadow-lg">
          Find The Real Reason Your Campaign Is Not Converting
        </h1>
        <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10">
          Stop wasting money fixing the wrong problem. JARVIS runs 4 expert AI analyses in parallel and tells you exactly what is killing your conversions in 40 seconds.
        </p>
        <Link
          href="/analyze"
          className="inline-block px-8 py-4 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-bold text-lg transition-colors shadow-lg"
        >
          Analyze My Campaign Free
        </Link>
        <p className="text-slate-500 text-sm mt-4">No signup required. No credit card. Just paste and analyze.</p>
      </section>

      {/* Problem */}
      <section className="max-w-4xl mx-auto px-6 sm:px-12 py-16 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
          Most tools tell you WHAT is wrong.
        </h2>
        <p className="text-slate-400 text-lg mb-8">
          Weak headline. Low CTR. Bad CTA. You already know that.
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold text-cyan-400 mb-4">
          JARVIS tells you WHY it is wrong.
        </h2>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          The headline is generic because it sells the product. Customers are not buying the product. They are buying relief, certainty, control, and time. That level of insight is what changes campaigns.
        </p>
      </section>

      {/* How It Works */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 py-16">
        <h2 className="text-3xl font-bold text-center text-white mb-12">How JARVIS Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-cyan-500 bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-cyan-400 text-xl font-bold">1</span>
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Paste Your Campaign</h3>
            <p className="text-slate-400 text-sm">Paste your landing page, ad copy, offer, sales page, or any campaign data.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-cyan-500 bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-cyan-400 text-xl font-bold">2</span>
            </div>
            <h3 className="text-white font-bold text-lg mb-2">4 Experts Analyze It</h3>
            <p className="text-slate-400 text-sm">Consumer Psychologist, Media Buyer, Growth Strategist, and Offer Strategist all analyze your campaign simultaneously.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-cyan-500 bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-cyan-400 text-xl font-bold">3</span>
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Get Your Intelligence Report</h3>
            <p className="text-slate-400 text-sm">JARVIS synthesizes all findings into one clear report with the exact fix to test next.</p>
          </div>
        </div>
      </section>

      {/* Experts */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 py-16">
        <h2 className="text-3xl font-bold text-center text-white mb-4">Your 4-Expert Intelligence Panel</h2>
        <p className="text-center text-slate-400 mb-12">Every analysis runs all 4 experts in parallel.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="text-cyan-400 font-bold text-sm mb-1">EXPERT 01</div>
            <h3 className="text-white font-bold text-lg mb-2">Consumer Psychologist</h3>
            <p className="text-slate-400 text-sm">Uncovers hidden desires, fears, identity motivations, and emotional triggers your customers would never say out loud.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="text-cyan-400 font-bold text-sm mb-1">EXPERT 02</div>
            <h3 className="text-white font-bold text-lg mb-2">Media Buyer</h3>
            <p className="text-slate-400 text-sm">Analyzes hook strength, scroll-stopping power, message-to-market match, and conversion risk from a performance perspective.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="text-cyan-400 font-bold text-sm mb-1">EXPERT 03</div>
            <h3 className="text-white font-bold text-lg mb-2">Growth Strategist</h3>
            <p className="text-slate-400 text-sm">Identifies the single biggest growth bottleneck and the highest leverage action available right now.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="text-cyan-400 font-bold text-sm mb-1">EXPERT 04</div>
            <h3 className="text-white font-bold text-lg mb-2">Offer Strategist</h3>
            <p className="text-slate-400 text-sm">Evaluates offer strength, value proposition clarity, differentiation, risk reversal, and pricing perception.</p>
          </div>
        </div>
      </section>

      {/* Sample Insight */}
      <section className="max-w-4xl mx-auto px-6 sm:px-12 py-16">
        <h2 className="text-3xl font-bold text-center text-white mb-4">The Kind of Insight JARVIS Reveals</h2>
        <p className="text-center text-slate-400 mb-10">This is the difference between generic advice and real intelligence.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-red-950 border border-red-800 rounded-xl p-6">
            <div className="text-red-400 font-bold text-sm mb-3">Generic Tool Says</div>
            <p className="text-slate-300">The headline is weak and not compelling enough.</p>
          </div>
          <div className="bg-cyan-950 border border-cyan-800 rounded-xl p-6">
            <div className="text-cyan-400 font-bold text-sm mb-3">JARVIS Says</div>
            <p className="text-slate-300">The headline sells the product. Your customers are not buying the product. They are buying relief from uncertainty and control over outcomes. Reframe around what they actually want.</p>
          </div>
        </div>
      </section>

      {/* Languages */}
      <section className="max-w-4xl mx-auto px-6 sm:px-12 py-16 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">Available in 10 Languages</h2>
        <p className="text-slate-400 mb-8">Get your full intelligence report in your native language.</p>
        <div className="flex flex-wrap justify-center gap-3">
          {["English", "Tagalog", "Spanish", "French", "German", "Portuguese", "Italian", "Japanese", "Chinese", "Arabic"].map((lang) => (
            <span key={lang} className="bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-full text-sm">
              {lang}
            </span>
          ))}
        </div>
      </section>

      {/* Tools Section */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 py-16">
        <h2 className="text-3xl font-bold text-center text-white mb-4">4 Intelligence Tools. One System.</h2>
        <p className="text-center text-slate-400 mb-12">Everything a media buyer needs to diagnose, optimize, and win.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <a href="/analyze" className="bg-slate-900 border border-slate-800 hover:border-cyan-500 rounded-xl p-8 text-left transition-all group no-underline">
            <div className="text-cyan-400 font-bold text-xs mb-2 tracking-widest">CAMPAIGN ANALYZER</div>
            <h3 className="text-white font-bold text-lg mb-2">Full Campaign Intelligence</h3>
            <p className="text-slate-400 text-sm mb-4">Paste your landing page, ad copy, or funnel. Get psychology, positioning, and exact copy to use.</p>
            <div className="text-cyan-400 text-sm font-semibold">Analyze My Campaign</div>
          </a>
          <a href="/facebook-ad" className="bg-slate-900 border border-slate-800 hover:border-orange-500 rounded-xl p-8 text-left transition-all group no-underline">
            <div className="text-orange-400 font-bold text-xs mb-2 tracking-widest">FACEBOOK AD ANALYZER</div>
            <h3 className="text-white font-bold text-lg mb-2">Facebook Ad Creative Analysis</h3>
            <p className="text-slate-400 text-sm mb-4">Get hook score, emotion analysis, audience match, and a rewritten winning ad.</p>
            <div className="text-orange-400 text-sm font-semibold">Analyze My Ad</div>
          </a>
          <a href="/competitor-spy" className="bg-slate-900 border border-slate-800 hover:border-purple-500 rounded-xl p-8 text-left transition-all group no-underline">
            <div className="text-purple-400 font-bold text-xs mb-2 tracking-widest">COMPETITOR AD SPY</div>
            <h3 className="text-white font-bold text-lg mb-2">Decode Competitor Strategy</h3>
            <p className="text-slate-400 text-sm mb-4">Paste any competitor ad. JARVIS decodes their angle, finds their weakness, and writes your counter-ad.</p>
            <div className="text-purple-400 text-sm font-semibold">Spy On Competitor</div>
          </a>
          <a href="/hook-generator" className="bg-slate-900 border border-slate-800 hover:border-yellow-500 rounded-xl p-8 text-left transition-all group no-underline">
            <div className="text-yellow-400 font-bold text-xs mb-2 tracking-widest">HOOK GENERATOR</div>
            <h3 className="text-white font-bold text-lg mb-2">Generate 10 Scroll-Stopping Hooks</h3>
            <p className="text-slate-400 text-sm mb-4">Enter your product and audience. Get 10 hooks with psychological triggers and performance predictions.</p>
            <div className="text-yellow-400 text-sm font-semibold">Generate Hooks</div>
          </a>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 sm:px-12 py-16">
        <h2 className="text-3xl font-bold text-center text-white mb-4">Simple Pricing</h2>
        <p className="text-center text-slate-400 mb-12">Start free. Upgrade when you are ready.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
            <div className="text-slate-400 font-bold text-xs tracking-widest mb-4">FREE</div>
            <div className="text-4xl font-extrabold text-white mb-1">      {/* CTA */}</div>
            <div className="text-slate-500 text-sm mb-6">Forever free</div>
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> 3 analyses per day</div>
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> All 4 tools</div>
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> Auto-detect language</div>
              <div className="flex items-center gap-2 text-slate-400 text-sm"><span className="text-slate-600">✗</span> PDF export</div>
              <div className="flex items-center gap-2 text-slate-400 text-sm"><span className="text-slate-600">✗</span> Priority speed</div>
            </div>
            <a href="/analyze" className="block text-center py-3 px-6 border border-slate-700 text-slate-300 rounded-lg font-medium text-sm hover:border-slate-500 transition-colors no-underline">Start Free</a>
          </div>

          <div className="bg-slate-900 border-2 border-cyan-500 rounded-xl p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cyan-500 text-white text-xs font-bold px-4 py-1 rounded-full">MOST POPULAR</div>
            <div className="text-cyan-400 font-bold text-xs tracking-widest mb-4">STARTER</div>
            <div className="text-4xl font-extrabold text-white mb-1">$29</div>
            <div className="text-slate-500 text-sm mb-6">per month</div>
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> Unlimited analyses</div>
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> All 4 tools</div>
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> Auto-detect language</div>
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> PDF export</div>
              <div className="flex items-center gap-2 text-slate-400 text-sm"><span className="text-slate-600">✗</span> Priority speed</div>
            </div>
            <a href="/checkout?plan=starter" className="block text-center py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium text-sm transition-colors no-underline">Get Started</a>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
            <div className="text-purple-400 font-bold text-xs tracking-widest mb-4">PRO</div>
            <div className="text-4xl font-extrabold text-white mb-1">$79</div>
            <div className="text-slate-500 text-sm mb-6">per month</div>
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> Unlimited analyses</div>
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> All 4 tools</div>
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> Auto-detect language</div>
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> PDF export</div>
              <div className="flex items-center gap-2 text-slate-300 text-sm"><span className="text-cyan-400">✓</span> Priority speed</div>
            </div>
            <a href="/checkout?plan=pro" className="block text-center py-3 px-6 border border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white rounded-lg font-medium text-sm transition-colors no-underline">Get Pro</a>
          </div>

        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-6 sm:px-12 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Ready to find out why your campaign is not converting?
        </h2>
        <p className="text-slate-400 text-lg mb-8">
          Paste your campaign data and get a full intelligence report in 40 seconds. Free. No signup required.
        </p>
        <Link
          href="/analyze"
          className="inline-block px-8 py-4 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-bold text-lg transition-colors"
        >
          Analyze My Campaign Free
        </Link>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 sm:px-12 py-16">
        <h2 className="text-3xl font-bold text-center text-white mb-12">Frequently Asked Questions</h2>
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-white font-bold mb-2">How does JARVIS work?</h3>
            <p className="text-slate-400 text-sm">You paste your campaign data, ad copy, or landing page. JARVIS runs 4 specialist analyses in parallel and synthesizes the findings into one clear intelligence report with exact copy to use.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-white font-bold mb-2">What languages does JARVIS support?</h3>
            <p className="text-slate-400 text-sm">JARVIS auto-detects your input language and responds in the same language. It works in any language including English, Tagalog, Spanish, French, Arabic, Japanese, and more.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-white font-bold mb-2">What is included in the free plan?</h3>
            <p className="text-slate-400 text-sm">The free plan gives you access to all 4 tools — Campaign Analyzer, Facebook Ad Analyzer, Competitor Ad Spy, and Hook Generator. No credit card required.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-white font-bold mb-2">Can I cancel my subscription anytime?</h3>
            <p className="text-slate-400 text-sm">Yes. You can cancel anytime from your Stripe billing portal. No questions asked. Your access continues until the end of your billing period.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-white font-bold mb-2">Is my payment information secure?</h3>
            <p className="text-slate-400 text-sm">Yes. All payments are processed by Stripe — the same payment system used by Amazon, Shopify, and Airbnb. JARVIS never sees or stores your card details.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-white font-bold mb-2">How is JARVIS different from ChatGPT?</h3>
            <p className="text-slate-400 text-sm">ChatGPT gives generic advice. JARVIS runs 4 specialized expert analyses — Consumer Psychologist, Media Buyer, Growth Strategist, and Offer Strategist — and synthesizes them into specific actionable intelligence for your exact campaign.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 sm:px-12 py-8 text-center text-slate-500 text-sm">
        JARVIS Marketing Intelligence
        <br />
        <span style={{marginTop: "8px", display: "inline-block"}}>Need help? <a href="mailto:jarvislogic@yahoo.com" className="text-cyan-400 hover:underline">jarvislogic@yahoo.com</a> or <a href="https://wa.me/306973229580" target="_blank" className="text-cyan-400 hover:underline">WhatsApp</a></span>
      </footer>

    </main>
  );
}