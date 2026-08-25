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
