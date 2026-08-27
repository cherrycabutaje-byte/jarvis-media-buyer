import { filterRowsByEntity } from "@/lib/repositories/metaAdObservationRepository"
import { aggregateObservations, type RawObservationRow } from "@/lib/product/performanceAggregation"
import { evaluateEvidence, buildDiagnosticEvidencePacket, type EvidenceContext } from "@/lib/product/evidenceGate"
import { evaluateMonitor, comparePeriods } from "@/lib/product/performanceAggregation"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function rawRow(entityType: string, entityId: string, spend: number, impressions: number): Record<string, unknown> {
  return { entity_type: entityType, entity_id: entityId, spend, impressions, clicks: null, results: null, reach: null, frequency: null, link_clicks: null, purchase_conversion_value: null, currency: "USD" }
}

function toRaw(r: Record<string, unknown>): RawObservationRow {
  return {
    spend: r.spend as number | null, impressions: r.impressions as number | null, reach: null, frequency: null,
    clicks: null, linkClicks: null, results: null, purchaseConversionValue: null, currency: "USD",
  }
}

console.log("=== GRAIN 1: Account monitoring reads only account observations ===")
{
  const mixedRows = [
    rawRow("ACCOUNT", "act_1", 100, 1000),
    rawRow("CAMPAIGN", "camp_1", 50, 500),
    rawRow("AD_SET", "adset_1", 30, 300),
    rawRow("AD", "ad_1", 20, 200),
  ]
  const filtered = filterRowsByEntity(mixedRows, "ACCOUNT", "act_1")
  assert(filtered.length === 1, `only the genuine ACCOUNT row is included (got ${filtered.length})`)
  const agg = aggregateObservations(filtered.map(toRaw))
  assert(agg.totalSpend === 100, `account spend is exactly the account row's own value, not summed with campaign/ad-set/ad (got ${agg.totalSpend})`)
}

console.log("\n=== GRAIN 2: Campaign monitoring reads only the selected campaign ===")
{
  const mixedRows = [
    rawRow("ACCOUNT", "act_1", 100, 1000),
    rawRow("CAMPAIGN", "camp_1", 50, 500),
    rawRow("AD_SET", "adset_1", 30, 300),
  ]
  const filtered = filterRowsByEntity(mixedRows, "CAMPAIGN", "camp_1")
  assert(filtered.length === 1, "only the selected campaign row is included")
  const agg = aggregateObservations(filtered.map(toRaw))
  assert(agg.totalSpend === 50, `campaign spend is exactly its own value, not contaminated by account/ad-set rows (got ${agg.totalSpend})`)
}

console.log("\n=== GRAIN 3: Ad-set monitoring reads only the selected ad set ===")
{
  const mixedRows = [rawRow("CAMPAIGN", "camp_1", 50, 500), rawRow("AD_SET", "adset_1", 30, 300), rawRow("AD_SET", "adset_2", 15, 150)]
  const filtered = filterRowsByEntity(mixedRows, "AD_SET", "adset_1")
  assert(filtered.length === 1 && filtered[0].entity_id === "adset_1", "only the selected ad set is included, not sibling ad sets")
}

console.log("\n=== GRAIN 4: Ad monitoring reads only the selected ad ===")
{
  const mixedRows = [rawRow("AD_SET", "adset_1", 30, 300), rawRow("AD", "ad_1", 20, 200), rawRow("AD", "ad_2", 10, 100)]
  const filtered = filterRowsByEntity(mixedRows, "AD", "ad_1")
  assert(filtered.length === 1 && filtered[0].entity_id === "ad_1", "only the selected ad is included, not sibling ads or its parent ad set")
}

console.log("\n=== GRAIN 5: Campaign A rows cannot contaminate campaign B ===")
{
  const mixedRows = [rawRow("CAMPAIGN", "camp_A", 100, 1000), rawRow("CAMPAIGN", "camp_B", 200, 2000)]
  const filteredA = filterRowsByEntity(mixedRows, "CAMPAIGN", "camp_A")
  const aggA = aggregateObservations(filteredA.map(toRaw))
  assert(aggA.totalSpend === 100, `campaign A's total is exactly its own spend, unaffected by campaign B (got ${aggA.totalSpend})`)
}

console.log("\n=== GRAIN 6: Ad rows cannot contaminate campaign totals ===")
{
  const mixedRows = [rawRow("CAMPAIGN", "camp_1", 100, 1000), rawRow("AD", "ad_1", 999, 9999)]
  const filtered = filterRowsByEntity(mixedRows, "CAMPAIGN", "camp_1")
  const agg = aggregateObservations(filtered.map(toRaw))
  assert(agg.totalSpend === 100, `campaign total excludes an ad's own (much larger) spend entirely (got ${agg.totalSpend}, would be 1099 if contaminated)`)
}
console.log("\n=== GRAIN 7: Campaign rows cannot contaminate account totals (the exact double-counting scenario named in review) ===")
{
  // campaign spend 100 + its own ad-set spend 100 + its own ads
  // spend 100 must NEVER sum to a fake account total of 300.
  const mixedRows = [
    rawRow("ACCOUNT", "act_1", 250, 2500),
    rawRow("CAMPAIGN", "camp_1", 100, 1000),
    rawRow("AD_SET", "adset_1", 100, 1000),
    rawRow("AD", "ad_1", 100, 1000),
  ]
  const filtered = filterRowsByEntity(mixedRows, "ACCOUNT", "act_1")
  const agg = aggregateObservations(filtered.map(toRaw))
  assert(agg.totalSpend === 250, `account total is its OWN genuine reported value (250), never 100+100+100=300 from summing overlapping grains (got ${agg.totalSpend})`)
}

console.log("\n=== GRAIN 8: Identical numeric external IDs at different entity types remain distinct ===")
{
  const mixedRows = [rawRow("CAMPAIGN", "123", 50, 500), rawRow("AD", "123", 999, 9999)]
  const filteredCampaign = filterRowsByEntity(mixedRows, "CAMPAIGN", "123")
  const filteredAd = filterRowsByEntity(mixedRows, "AD", "123")
  assert(filteredCampaign.length === 1 && filteredCampaign[0].spend === 50, "campaign '123' resolves only to the campaign row")
  assert(filteredAd.length === 1 && filteredAd[0].spend === 999, "ad '123' resolves only to the ad row - same external id, different entity type, no collision")
}

function baseContext(overrides: Partial<EvidenceContext> = {}): EvidenceContext {
  return {
    workspaceId: "ws1", brandId: "brand1", metaAdAccountLinkId: "link1",
    entityType: "CAMPAIGN", entityId: "camp_1",
    comparisonEntityType: "CAMPAIGN", comparisonEntityId: "camp_1", comparisonWorkspaceId: "ws1",
    currentPeriod: { start: "2026-08-18", end: "2026-08-24" },
    comparisonPeriod: { start: "2026-08-11", end: "2026-08-17" },
    currentObservationSyncedAt: new Date().toISOString(),
    isHistoricalAnalysis: false,
    ...overrides,
  }
}

console.log("\n=== GRAIN 9: Evidence Gate provenance matches the selected real entity ===")
{
  const context = baseContext({ entityType: "CAMPAIGN", entityId: "camp_specific_42", comparisonEntityType: "CAMPAIGN", comparisonEntityId: "camp_specific_42" })
  const current = aggregateObservations([{ ...toRaw(rawRow("CAMPAIGN", "camp_specific_42", 100, 1000)) }])
  const previous = aggregateObservations([{ ...toRaw(rawRow("CAMPAIGN", "camp_specific_42", 100, 1000)) }])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const gate = evaluateEvidence(context, current, previous, monitor)
  assert(gate.comparisonValid === true, "provenance matches -> comparison validates for the exact selected entity")
}

console.log("\n=== GRAIN 10: Diagnostic Evidence Packet preserves exactly the selected entity ===")
{
  const context = baseContext({ entityType: "AD_SET", entityId: "adset_specific_7", comparisonEntityType: "AD_SET", comparisonEntityId: "adset_specific_7" })
  const current = aggregateObservations([{ ...toRaw(rawRow("AD_SET", "adset_specific_7", 100, 5000)) }])
  const previous = aggregateObservations([{ ...toRaw(rawRow("AD_SET", "adset_specific_7", 100, 5000)) }])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const packet = buildDiagnosticEvidencePacket(context, gate, monitor)
  assert(packet?.entityType === "AD_SET" && packet?.entityId === "adset_specific_7", "packet preserves exactly the ad set entity that was monitored, not a mixed/derived one")
}

console.log("\n=== GRAIN 11: Mismatched entity data fails closed ===")
{
  const context = baseContext({ entityType: "CAMPAIGN", entityId: "camp_1", comparisonEntityType: "CAMPAIGN", comparisonEntityId: "camp_DIFFERENT" })
  const current = aggregateObservations([{ ...toRaw(rawRow("CAMPAIGN", "camp_1", 100, 1000)) }])
  const previous = aggregateObservations([{ ...toRaw(rawRow("CAMPAIGN", "camp_DIFFERENT", 100, 1000)) }])
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const gate = evaluateEvidence(context, current, previous, monitor)
  assert(gate.comparisonValid === false, "comparing two genuinely different entity IDs fails closed rather than silently comparing mismatched entities")
}

console.log("\n=== GRAIN 12: Empty entity history returns insufficient/no-data, never another entity's observations ===")
{
  const mixedRows = [rawRow("CAMPAIGN", "camp_OTHER", 500, 5000)]
  const filtered = filterRowsByEntity(mixedRows, "CAMPAIGN", "camp_NEVER_SYNCED")
  assert(filtered.length === 0, "a campaign with no genuine observations of its own returns zero rows, never another campaign's data")
  const agg = aggregateObservations(filtered.map(toRaw))
  assert(agg.observationCount === 0 && agg.totalSpend === null, "empty entity history aggregates to genuinely empty/null, never borrowing another entity's totals")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }