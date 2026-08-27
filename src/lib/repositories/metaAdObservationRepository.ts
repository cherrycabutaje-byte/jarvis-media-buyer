import { createClient } from "@/lib/supabase/server"
import type { MetaAdObservation } from "@/lib/product/providers/metaAdsReadProvider"

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * DEDUPLICATION: upsertObservations() relies on the real database
 * unique constraint (link_id, entity_type, entity_id, period_start,
 * period_end) via Postgres's ON CONFLICT DO UPDATE - the same
 * observation identity always updates the same row rather than
 * creating a duplicate, and a revised Meta metric safely overwrites
 * the previous value.
 */
export async function upsertObservations(
  linkId: string,
  observations: MetaAdObservation[]
): Promise<RepositoryResult<number>> {
  if (observations.length === 0) {
    return { data: 0, error: null }
  }

  const supabase = await createClient()
  const rows = observations.map((obs) => ({
    meta_ad_account_link_id: linkId,
    entity_type: obs.entityType,
    entity_id: obs.entityId,
    period_start: obs.periodStart,
    period_end: obs.periodEnd,
    currency: obs.currency,
    spend: obs.spend,
    impressions: obs.impressions,
    reach: obs.reach,
    frequency: obs.frequency,
    cpm: obs.cpm,
    clicks: obs.clicks,
    link_clicks: obs.linkClicks,
    ctr: obs.ctr,
    cpc: obs.cpc,
    results: obs.results,
    cost_per_result: obs.costPerResult,
    purchase_conversion_value: obs.purchaseConversionValue,
    roas: obs.roas,
    attribution_setting: obs.attributionSetting,
    last_synced_at: new Date().toISOString(),
  }))

  const { error, count } = await supabase
    .from("meta_ad_observations")
    .upsert(rows, {
      onConflict: "meta_ad_account_link_id,entity_type,entity_id,period_start,period_end",
      count: "exact",
    })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: count ?? rows.length, error: null }
}

export async function getObservationsForLink(linkId: string): Promise<RepositoryResult<Array<Record<string, unknown>>>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_ad_observations")
    .select("*")
    .eq("meta_ad_account_link_id", linkId)

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data ?? [], error: null }
}

/**
 * ENTITY-GRAIN INTEGRITY (mandatory): filters by entity_type AND
 * entity_id at the query layer, in addition to link_id and period.
 * meta_ad_observations stores account/campaign/ad-set/ad rows in
 * the SAME table, and these grains genuinely overlap (a campaign's
 * spend and its own ad sets' spend both exist as separate rows) -
 * querying by link_id and period alone would silently mix multiple
 * overlapping grains together and double/triple-count spend,
 * impressions, and every other metric. This function returns
 * observations for exactly ONE explicit entity - never an
 * indiscriminate sum across grains.
 */
export async function getObservationsInRange(
  linkId: string,
  entityType: string,
  entityId: string,
  periodStart: string,
  periodEnd: string
): Promise<RepositoryResult<Array<Record<string, unknown>>>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_ad_observations")
    .select("*")
    .eq("meta_ad_account_link_id", linkId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .gte("period_start", periodStart)
    .lte("period_end", periodEnd)

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data ?? [], error: null }
}

/**
 * Defensive, application-layer second filter (defense in depth).
 * Even though getObservationsInRange already filters at the SQL
 * query layer, this pure function re-asserts the same entity-grain
 * boundary in application code - directly testable without a live
 * database, and a safety net if the query layer were ever changed
 * incorrectly in the future. Never a substitute for the query
 * filter, only a second, independent guard.
 */
export function filterRowsByEntity(
  rows: Array<Record<string, unknown>>,
  entityType: string,
  entityId: string
): Array<Record<string, unknown>> {
  return rows.filter((r) => r.entity_type === entityType && r.entity_id === entityId)
}