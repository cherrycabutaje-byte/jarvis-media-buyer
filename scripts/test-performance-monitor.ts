import {
  aggregateObservations,
  comparePeriods,
  evaluateMonitor,
  MATERIALITY_RULES,
  type RawObservationRow,
} from "@/lib/product/performanceAggregation"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function row(overrides: Partial<RawObservationRow> = {}): RawObservationRow {
  return {
    spend: null, impressions: null, reach: null, frequency: null, clicks: null, linkClicks: null, results: null, purchaseConversionValue: null, currency: "USD",
    ...overrides,
  }
}

console.log("=== CASE 1: Sum correctness with mixed real values ===")
{
  const agg = aggregateObservations([row({ spend: 10 }), row({ spend: 20 })])
  assert(agg.totalSpend === 30, `sum of real values correct (got ${agg.totalSpend})`)
}

console.log("\n=== CASE 2: Missing metric stays unavailable (all-null column) ===")
{
  const agg = aggregateObservations([row({ impressions: null }), row({ impressions: null })])
  assert(agg.totalImpressions === null, "all-null column yields null, never a fabricated 0")
}

console.log("\n=== CASE 3: Real zero preserved in sum ===")
{
  const agg = aggregateObservations([row({ clicks: 0 }), row({ clicks: 5 })])
  assert(agg.totalClicks === 5, `real zero correctly included in sum (got ${agg.totalClicks})`)
}
{
  const agg = aggregateObservations([row({ clicks: 0 }), row({ clicks: 0 })])
  assert(agg.totalClicks === 0, `all-real-zero sum is 0, not null (got ${agg.totalClicks})`)
}

console.log("\n=== CASE 4: Percent change from zero previous handled safely ===")
{
  const current = aggregateObservations([row({ spend: 50 })])
  const previous = aggregateObservations([row({ spend: 0 })])
  const comparison = comparePeriods(current, previous)
  assert(comparison.spend.percentChange === null, "percent change from a zero base is null, not Infinity or fabricated")
  assert(comparison.spend.absoluteChange === 50, "absolute change is still correctly computed")
}

console.log("\n=== CASE 5: Missing previous observation set -> INSUFFICIENT_DATA ===")
{
  const current = aggregateObservations([row({ spend: 50, impressions: 1000, clicks: 20 })])
  const previous = aggregateObservations([])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  assert(monitor.status === "INSUFFICIENT_DATA", `no previous observations -> INSUFFICIENT_DATA (got ${monitor.status})`)
}

console.log("\n=== CASE 6: Tiny change is not material ===")
{
  const current = aggregateObservations([row({ spend: 102, impressions: 1000, clicks: 20 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 1000, clicks: 20 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const spendChange = monitor.changes.find((c) => c.metric === "spend")
  assert(spendChange?.material === false, `2% spend change is not material (got material=${spendChange?.material})`)
}

console.log("\n=== CASE 7: Large change is material ===")
{
  const current = aggregateObservations([row({ spend: 50, impressions: 1000, clicks: 20 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 1000, clicks: 20 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const spendChange = monitor.changes.find((c) => c.metric === "spend")
  assert(spendChange?.material === true, `50% spend drop is material (got material=${spendChange?.material})`)
}

console.log("\n=== CASE 8: Low impressions suppress CTR-related (clicks) materiality flag ===")
{
  const current = aggregateObservations([row({ spend: 50, impressions: 10, clicks: 1 })])
  const previous = aggregateObservations([row({ spend: 50, impressions: 10, clicks: 5 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const clicksChange = monitor.changes.find((c) => c.metric === "clicks")
  assert(clicksChange?.sufficientEvidence === false, "only 10 impressions -> insufficient evidence for a clicks/CTR alert")
  assert(clicksChange?.material === false, "insufficient evidence -> never flagged material regardless of the raw percent swing")
}

console.log("\n=== CASE 9: Low spend suppresses CPA-related (spend) materiality flag ===")
{
  const current = aggregateObservations([row({ spend: 0.5, impressions: 1000, clicks: 20 })])
  const previous = aggregateObservations([row({ spend: 2, impressions: 1000, clicks: 20 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const spendChange = monitor.changes.find((c) => c.metric === "spend")
  assert(spendChange?.sufficientEvidence === false, "€0.50/€2 spend is below the minimum -> insufficient evidence for a spend/CPA alert")
}

console.log("\n=== CASE 10: Insufficient conversions suppress ROAS/results confidence ===")
{
  const current = aggregateObservations([row({ results: 1, purchaseConversionValue: 100, spend: 50 })])
  const previous = aggregateObservations([row({ results: 1, purchaseConversionValue: 10, spend: 50 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const resultsChange = monitor.changes.find((c) => c.metric === "results")
  assert(resultsChange?.sufficientEvidence === false, "only 1 conversion on both sides -> insufficient evidence for a results/ROAS alert")
}

console.log("\n=== CASE 11: Stable metrics -> STABLE ===")
{
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const previous = aggregateObservations([row({ spend: 102, impressions: 5100, clicks: 98, results: 10 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  assert(monitor.status === "STABLE", `small fluctuations across the board -> STABLE (got ${monitor.status})`)
}

console.log("\n=== CASE 12: One material change -> CHANGE_DETECTED ===")
{
  // Constructed directly at the evaluateMonitor level (bypassing
  // aggregateObservations) to cleanly isolate exactly one material
  // signal - cost-based ratio metrics (CPC/CPM/CPA) mathematically
  // inherit spend's own movement (proven by CASE 12b below), so
  // realistic raw observation rows cannot isolate a single count
  // metric from its coupled ratios. This test instead validates the
  // STATUS-COUNTING logic on its own: all fields identical except
  // one genuinely material spend change.
  const base = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const current = { ...base, totalSpend: 50 }
  const previous = { ...base }
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  assert(monitor.status === "CHANGE_DETECTED", `exactly one material change (spend) -> CHANGE_DETECTED (got ${monitor.status})`)
}

console.log("\n=== CASE 12b: Cost-ratio metrics mathematically inherit spend's movement (real coupling, not a bug) ===")
{
  const current = aggregateObservations([row({ spend: 50, impressions: 5000, clicks: 100, results: 10 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5050, clicks: 102, results: 10 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const cpcChange = monitor.changes.find((c) => c.metric === "cpc")
  assert(cpcChange?.material === true, "CPC correctly reflects a large spend-driven shift, since CPC = spend/clicks and clicks stayed flat")
}

console.log("\n=== CASE 13: Multiple material changes -> ATTENTION_REQUIRED ===")
{
  const current = aggregateObservations([row({ spend: 50, impressions: 2000, clicks: 20, results: 10 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  assert(monitor.status === "ATTENTION_REQUIRED", `multiple large material changes -> ATTENTION_REQUIRED (got ${monitor.status})`)
}

console.log("\n=== CASE 14: Account/campaign/ad-set/ad grain all use the same pure aggregation (grain-agnostic proof) ===")
{
  // The aggregation module never references entity_type at all - it
  // operates purely on whatever rows it's given, meaning the SAME
  // function correctly serves account, campaign, ad-set, and ad
  // grain as long as the caller pre-filters rows to one grain.
  const accountRows = [row({ spend: 10 })]
  const campaignRows = [row({ spend: 20 })]
  const accountAgg = aggregateObservations(accountRows)
  const campaignAgg = aggregateObservations(campaignRows)
  assert(accountAgg.totalSpend === 10 && campaignAgg.totalSpend === 20, "each grain's rows are aggregated independently and correctly")
}

console.log("\n=== CASE 15: No diagnostic language exists in the output contract (structural proof) ===")
{
  const current = aggregateObservations([row({ spend: 50, impressions: 2000, clicks: 20, results: 10 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const serialized = JSON.stringify(monitor).toLowerCase()
  const forbiddenWords = ["fatigue", "bad", "good", "winning", "losing", "pause", "scale", "fix", "recommend", "should"]
  const foundForbidden = forbiddenWords.filter((w) => serialized.includes(w))
  assert(foundForbidden.length === 0, `no diagnostic/recommendation language anywhere in the output (found: ${foundForbidden.join(", ") || "none"})`)
}

console.log("\n=== CASE 16: No action recommendation field exists on ObservedChange (structural proof) ===")
{
  const current = aggregateObservations([row({ spend: 50, impressions: 2000 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 2000 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const keys = Object.keys(monitor.changes[0])
  const forbiddenKeys = ["recommendation", "action", "diagnosis", "cause", "severity"]
  assert(!keys.some((k) => forbiddenKeys.includes(k)), `ObservedChange has no recommendation/diagnosis field (keys: ${keys.join(", ")})`)
}

console.log("\n=== CASE 17: Derived ratios only computed when real components are present ===")
{
  const agg = aggregateObservations([row({ spend: 50, impressions: null })])
  assert(agg.averageCpm === null, "CPM not fabricated when impressions are genuinely unavailable")
}
{
  const agg = aggregateObservations([row({ spend: 50, impressions: 1000 })])
  assert(agg.averageCpm === 50, `CPM correctly computed when both components present (got ${agg.averageCpm})`)
}

console.log("\n=== CASE 18: Empty observation set aggregates to all-null, zero count ===")
{
  const agg = aggregateObservations([])
  assert(agg.observationCount === 0 && agg.totalSpend === null, "empty input yields count=0 and all-null totals, never fabricated")
}

console.log("\n=== CASE 19: Ratio-of-sums CTR with UNEQUAL observation sizes (naive averaging would be wrong) ===")
{
  // Row A: 900/1000 clicks (90% CTR), Row B: 1/1000 clicks (0.1% CTR).
  // Naive average-of-ratios = (90 + 0.1) / 2 = 45.05% - clearly wrong.
  // Correct ratio-of-sums = (900+1)/(1000+1000) * 100 = 45.05... let's
  // use genuinely unequal WEIGHTS instead: one huge row, one tiny row.
  const agg = aggregateObservations([
    row({ clicks: 10, impressions: 10000 }), // 0.1% CTR, huge volume
    row({ clicks: 900, impressions: 1000 }), // 90% CTR, tiny volume
  ])
  const naiveAverage = (0.1 + 90) / 2 // what a WRONG average-of-ratios implementation would produce
  const correctRatioOfSums = ((10 + 900) / (10000 + 1000)) * 100
  assert(Math.abs((agg.averageCtr ?? 0) - correctRatioOfSums) < 0.01, `CTR is ratio-of-sums (got ${agg.averageCtr}, expected ~${correctRatioOfSums.toFixed(2)})`)
  assert(Math.abs((agg.averageCtr ?? 0) - naiveAverage) > 5, "CTR is NOT a naive average-of-ratios (which would incorrectly ignore volume)")
}

console.log("\n=== CASE 20: Ratio-of-sums CPC with unequal sizes ===")
{
  const agg = aggregateObservations([
    row({ spend: 1000, clicks: 1000 }), // $1.00 CPC, huge volume
    row({ spend: 10, clicks: 2 }), // $5.00 CPC, tiny volume
  ])
  const correctRatioOfSums = (1000 + 10) / (1000 + 2)
  const naiveAverage = (1.0 + 5.0) / 2
  assert(Math.abs((agg.averageCpc ?? 0) - correctRatioOfSums) < 0.01, `CPC is ratio-of-sums (got ${agg.averageCpc}, expected ~${correctRatioOfSums.toFixed(3)})`)
  assert(Math.abs((agg.averageCpc ?? 0) - naiveAverage) > 1, "CPC is NOT naively averaged across unequal-sized rows")
}

console.log("\n=== CASE 21: Ratio-of-sums CPM with unequal sizes ===")
{
  const agg = aggregateObservations([
    row({ spend: 100, impressions: 100000 }), // $1 CPM, huge volume
    row({ spend: 50, impressions: 1000 }), // $50 CPM, tiny volume
  ])
  const correctRatioOfSums = ((100 + 50) / (100000 + 1000)) * 1000
  assert(Math.abs((agg.averageCpm ?? 0) - correctRatioOfSums) < 0.01, `CPM is ratio-of-sums (got ${agg.averageCpm}, expected ~${correctRatioOfSums.toFixed(3)})`)
}

console.log("\n=== CASE 22: Ratio-of-sums cost-per-result with unequal sizes ===")
{
  const agg = aggregateObservations([
    row({ spend: 500, results: 100 }), // $5/result, huge volume
    row({ spend: 50, results: 1 }), // $50/result, tiny volume
  ])
  const correctRatioOfSums = (500 + 50) / (100 + 1)
  assert(Math.abs((agg.averageCostPerResult ?? 0) - correctRatioOfSums) < 0.01, `cost-per-result is ratio-of-sums (got ${agg.averageCostPerResult}, expected ~${correctRatioOfSums.toFixed(3)})`)
}

console.log("\n=== CASE 23: Ratio-of-sums ROAS with unequal sizes ===")
{
  const agg = aggregateObservations([
    row({ spend: 1000, purchaseConversionValue: 5000 }), // 5x ROAS, huge volume
    row({ spend: 10, purchaseConversionValue: 5 }), // 0.5x ROAS, tiny volume
  ])
  const correctRatioOfSums = (5000 + 5) / (1000 + 10)
  assert(Math.abs((agg.averageRoas ?? 0) - correctRatioOfSums) < 0.01, `ROAS is ratio-of-sums (got ${agg.averageRoas}, expected ~${correctRatioOfSums.toFixed(3)})`)
}

console.log("\n=== CASE 24: Frequency - single observation passes through Meta's own reported value directly ===")
{
  const agg = aggregateObservations([row({ impressions: 1000, reach: 400, frequency: 2.5 })])
  assert(agg.averageFrequency === 2.5, `single-row frequency passed through directly (got ${agg.averageFrequency})`)
}

console.log("\n=== CASE 25: Frequency - multiple rows honestly unavailable rather than fabricated from summed reach ===")
{
  const agg = aggregateObservations([
    row({ impressions: 1000, reach: 400, frequency: 2.5 }),
    row({ impressions: 1000, reach: 400, frequency: 2.5 }),
  ])
  assert(agg.averageFrequency === null, `multi-row frequency is honestly null, never derived from a naively-summed (double-counted) reach (got ${agg.averageFrequency})`)
}

console.log("\n=== CASE 26: Reach is still summed as an upper-bound approximation, not silently dropped ===")
{
  const agg = aggregateObservations([row({ reach: 400 }), row({ reach: 400 })])
  assert(agg.totalReach === 800, `reach sum still computed as an upper-bound approximation (got ${agg.totalReach})`)
}

console.log("\n=== CASE 27: Metric-family materiality - RATIO threshold (25%) genuinely differs from COUNT threshold (20%) ===")
{
  // A 22% swing crosses the COUNT family's 20% threshold but must
  // NOT cross the RATIO family's higher 25% threshold - this is the
  // key proof that the two families use genuinely different values,
  // not a coincidence of this specific scenario.
  const current = aggregateObservations([row({ clicks: 78, impressions: 10000, spend: 50, results: 10 })])
  const previous = aggregateObservations([row({ clicks: 100, impressions: 10000, spend: 50, results: 10 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const clicksChange = monitor.changes.find((c) => c.metric === "clicks")
  const ctrChange = monitor.changes.find((c) => c.metric === "ctr")
  assert(clicksChange?.material === true, `22% clicks (COUNT, 20% threshold) change is material (got ${clicksChange?.material})`)
  assert(ctrChange?.material === false, `the SAME 22% swing on CTR (RATIO, 25% threshold) is correctly NOT material - proving the two family thresholds behave differently on identical magnitude (got ${ctrChange?.material})`)
}
{
  // Now a genuinely intermediate swing (22%) that clears COUNT's 20%
  // threshold but must NOT clear RATIO's 25% threshold, to prove the
  // two thresholds are genuinely different values in practice.
  const current2 = aggregateObservations([row({ clicks: 100, impressions: 7800, spend: 50 })])
  const previous2 = aggregateObservations([row({ clicks: 100, impressions: 10000, spend: 50 })])
  const comparison2 = comparePeriods(current2, previous2)
  const monitor2 = evaluateMonitor(current2, previous2, comparison2)
  const impressionsChange = monitor2.changes.find((c) => c.metric === "impressions")
  const ctrChange2 = monitor2.changes.find((c) => c.metric === "ctr")
  assert(impressionsChange?.material === true, "22% impressions drop crosses the 20% COUNT threshold")
  assert(ctrChange2?.material === true, `CTR rises correspondingly (clicks flat, impressions down) and also crosses its own 25% RATIO threshold here (got ${ctrChange2?.material})`)
  assert(MATERIALITY_RULES.impressions.percentThreshold !== MATERIALITY_RULES.ctr.percentThreshold, `COUNT (${MATERIALITY_RULES.impressions.percentThreshold}%) and RATIO (${MATERIALITY_RULES.ctr.percentThreshold}%) thresholds are genuinely distinct values`)
}

console.log("\n=== CASE 28: Direction remains factual and independent of materiality/evaluative meaning ===")
{
  const current = aggregateObservations([row({ spend: 102 })])
  const previous = aggregateObservations([row({ spend: 100 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const spendChange = monitor.changes.find((c) => c.metric === "spend")
  assert(spendChange?.direction === "UP", `direction is set correctly (got ${spendChange?.direction})`)
  assert(spendChange?.material === false, "a tiny 2% change has direction=UP but is NOT material - direction and materiality are independent facts")
}

console.log("\n=== CASE 29: Currency mismatch across periods fails sufficiency closed, never silently compared ===")
{
  const current = aggregateObservations([row({ spend: 50, results: 5, currency: "USD" })])
  const previous = aggregateObservations([row({ spend: 50, results: 5, currency: "EUR" })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const spendChange = monitor.changes.find((c) => c.metric === "spend")
  assert(spendChange?.sufficientEvidence === false, `mismatched currencies (USD vs EUR) fail spend sufficiency closed, never silently compared as if equivalent (got sufficientEvidence=${spendChange?.sufficientEvidence})`)
}

console.log("\n=== CASE 30: Zero-baseline COUNT metric transition (0 -> real value) is material via a deterministic structural rule, not an invented percentage ===")
{
  const current = aggregateObservations([row({ results: 10, spend: 50 })])
  const previous = aggregateObservations([row({ results: 0, spend: 50 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const resultsChange = monitor.changes.find((c) => c.metric === "results")
  assert(resultsChange?.percentChange === null, "percent change from a zero baseline remains honestly null/undefined, never an invented percentage")
  assert(resultsChange?.material === true, `a genuine zero -> nonzero transition for a COUNT metric is recognized as material via a deterministic transition rule (got material=${resultsChange?.material})`)
}

console.log("\n=== CASE 31: Zero-baseline transition does NOT apply to RATIO-family metrics ===")
{
  // Construct a case where a ratio metric's previous value happens
  // to be computed as exactly 0 (e.g. zero clicks with real
  // impressions -> CTR = 0), then clicks becomes nonzero. The
  // zero-baseline auto-material rule must NOT fire for CTR, since it
  // is a RATIO-family metric, not COUNT.
  const current = aggregateObservations([row({ clicks: 5, impressions: 10000, spend: 50, results: 3 })])
  const previous = aggregateObservations([row({ clicks: 0, impressions: 10000, spend: 50, results: 3 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const ctrChange = monitor.changes.find((c) => c.metric === "ctr")
  assert(ctrChange?.previousValue === 0, "CTR previous value is genuinely 0 in this scenario")
  assert(ctrChange?.material === false, `zero-baseline auto-material rule correctly does NOT apply to RATIO-family CTR (got material=${ctrChange?.material})`)
}

console.log("\n=== CASE 32: Missing != zero remains preserved through the full comparison/materiality pipeline ===")
{
  const current = aggregateObservations([row({ spend: 50, impressions: null, clicks: null })])
  const previous = aggregateObservations([row({ spend: 50, impressions: 1000, clicks: 20 })])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const clicksChange = monitor.changes.find((c) => c.metric === "clicks")
  assert(clicksChange?.currentValue === null, "a genuinely missing current value stays null through the full pipeline, never fabricated as 0")
  assert(clicksChange?.material === false, "a null current value can never be flagged material (no fabricated comparison)")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }
