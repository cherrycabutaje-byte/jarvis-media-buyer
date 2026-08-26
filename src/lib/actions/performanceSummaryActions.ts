"use server"

import { createClient } from "@/lib/supabase/server"
import { getBrandById } from "@/lib/repositories/brandRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { getMetaAdAccountLinkForBrand } from "@/lib/repositories/metaAdAccountRepository"
import { getObservationsInRange } from "@/lib/repositories/metaAdObservationRepository"
import { aggregateObservations, comparePeriods, evaluateMonitor, type AggregatedMetrics, type PeriodComparison, type RawObservationRow, type MonitorResult } from "@/lib/product/performanceAggregation"

export interface PerformanceSummaryResult {
  success: boolean
  error: string | null
  currentPeriod: { start: string; end: string } | null
  previousPeriod: { start: string; end: string } | null
  current: AggregatedMetrics | null
  previous: AggregatedMetrics | null
  comparison: PeriodComparison | null
  monitor: MonitorResult | null
}

function toRawRow(row: Record<string, unknown>): RawObservationRow {
  const num = (v: unknown): number | null => (typeof v === "number" ? v : v === null || v === undefined ? null : Number(v))
  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    frequency: num(row.frequency),
    clicks: num(row.clicks),
    linkClicks: num(row.link_clicks),
    results: num(row.results),
    purchaseConversionValue: num(row.purchase_conversion_value),
    currency: typeof row.currency === "string" ? row.currency : null,
  }
}

export async function getPerformanceSummaryAction(
  brandId: string,
  currentPeriod: { start: string; end: string },
  previousPeriod: { start: string; end: string }
): Promise<PerformanceSummaryResult> {
  const fail = (error: string): PerformanceSummaryResult => ({
    success: false, error, currentPeriod: null, previousPeriod: null, current: null, previous: null, comparison: null, monitor: null,
  })

  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return fail("You must be logged in.")
  }

  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return fail(brandResult.error ?? "Business not found.")
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === brandResult.data!.workspace_id)
  if (!isMember) {
    return fail("You are not authorized to view performance data for this business.")
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return fail("No Meta ad account is connected for this business.")
  }

  const currentRowsResult = await getObservationsInRange(linkResult.data.id, currentPeriod.start, currentPeriod.end)
  const previousRowsResult = await getObservationsInRange(linkResult.data.id, previousPeriod.start, previousPeriod.end)

  if (currentRowsResult.error || previousRowsResult.error) {
    return fail(currentRowsResult.error ?? previousRowsResult.error ?? "Could not read performance data.")
  }

  const currentAggregated = aggregateObservations((currentRowsResult.data ?? []).map(toRawRow))
  const previousAggregated = aggregateObservations((previousRowsResult.data ?? []).map(toRawRow))
  const comparison = comparePeriods(currentAggregated, previousAggregated)
  const monitor = evaluateMonitor(currentAggregated, previousAggregated, comparison)

  return {
    success: true,
    error: null,
    currentPeriod,
    previousPeriod,
    current: currentAggregated,
    previous: previousAggregated,
    comparison,
    monitor,
  }
}
