"use server"

import { createClient } from "@/lib/supabase/server"
import { getBrandById } from "@/lib/repositories/brandRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { getMetaAdAccountLinkForBrand, getMetaAdAccountCredential, recordSyncResult } from "@/lib/repositories/metaAdAccountRepository"
import { upsertObservations } from "@/lib/repositories/metaAdObservationRepository"
import { GraphApiMetaAdsProvider } from "@/lib/product/providers/graphApiMetaAdsProvider"
import type { MetaAdObservation } from "@/lib/product/providers/metaAdsReadProvider"

export interface SyncMetaAdsObservationsResult {
  success: boolean
  error: string | null
  accountName: string | null
  campaignsCount: number
  adSetsCount: number
  adsCount: number
  observationsCount: number
}

/**
 * PERMANENT ARCHITECTURAL RULE: Meta observations are evidence.
 * JARVIS conclusions are interpretations. This orchestrator writes
 * only factual, normalized observations - never diagnoses,
 * recommends, or judges performance. Read-only throughout.
 *
 * A configured-but-unverified credential alone can never produce a
 * successful sync snapshot - this is the ONLY code path that ever
 * writes a successful sync snapshot row, and only after a real
 * attempt to reach Meta occurs.
 */
export async function syncMetaAdsObservations(brandId: string, dateRange: { since: string; until: string }): Promise<SyncMetaAdsObservationsResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  const failResult = (error: string): SyncMetaAdsObservationsResult => ({
    success: false, error, accountName: null, campaignsCount: 0, adSetsCount: 0, adsCount: 0, observationsCount: 0,
  })

  if (userError || !userData.user) {
    return failResult("You must be logged in.")
  }

  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return failResult(brandResult.error ?? "Business not found.")
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === brandResult.data!.workspace_id)
  if (!isMember) {
    return failResult("You are not authorized to sync advertising data for this business.")
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return failResult("No Meta ad account is connected for this business.")
  }
  const link = linkResult.data

  if (link.status !== "connected") {
    return failResult("This Meta ad account connection is not active. Please reconnect before syncing.")
  }

  const credentialResult = await getMetaAdAccountCredential(link.id)
  if (credentialResult.error || !credentialResult.data) {
    await recordSyncResult({ linkId: link.id, success: false, error: "Could not retrieve the stored credential." })
    return failResult("Could not retrieve the stored credential.")
  }
  const accessToken = credentialResult.data

  const provider = new GraphApiMetaAdsProvider()

  const accountResult = await provider.getAdAccount(accessToken, link.meta_ad_account_id)
  if (!accountResult.success || !accountResult.data) {
    await recordSyncResult({ linkId: link.id, success: false, error: accountResult.error?.message ?? "Could not read the ad account." })
    return failResult(accountResult.error?.message ?? "Could not read the ad account.")
  }

  const campaignsResult = await provider.listCampaigns(accessToken, link.meta_ad_account_id)
  if (!campaignsResult.success || !campaignsResult.data) {
    await recordSyncResult({ linkId: link.id, success: false, error: campaignsResult.error?.message ?? "Could not read campaigns." })
    return failResult(campaignsResult.error?.message ?? "Could not read campaigns.")
  }
  const campaigns = campaignsResult.data

  const allObservations: MetaAdObservation[] = []
  let adSetsCount = 0
  let adsCount = 0

  const accountInsights = await provider.getInsights(accessToken, link.meta_ad_account_id, "ACCOUNT", dateRange)
  if (accountInsights.success && accountInsights.data) {
    allObservations.push(...accountInsights.data)
  }

  for (const campaign of campaigns) {
    const campaignInsights = await provider.getInsights(accessToken, campaign.id, "CAMPAIGN", dateRange)
    if (campaignInsights.success && campaignInsights.data) {
      allObservations.push(...campaignInsights.data)
    }

    const adSetsResult = await provider.listAdSets(accessToken, campaign.id)
    if (adSetsResult.success && adSetsResult.data) {
      adSetsCount += adSetsResult.data.length
      for (const adSet of adSetsResult.data) {
        const adSetInsights = await provider.getInsights(accessToken, adSet.id, "AD_SET", dateRange)
        if (adSetInsights.success && adSetInsights.data) {
          allObservations.push(...adSetInsights.data)
        }

        const adsResult = await provider.listAds(accessToken, adSet.id)
        if (adsResult.success && adsResult.data) {
          adsCount += adsResult.data.length
          for (const ad of adsResult.data) {
            const adInsights = await provider.getInsights(accessToken, ad.id, "AD", dateRange)
            if (adInsights.success && adInsights.data) {
              allObservations.push(...adInsights.data)
            }
          }
        }
      }
    }
  }

  const upsertResult = await upsertObservations(link.id, allObservations)
  if (upsertResult.error) {
    await recordSyncResult({ linkId: link.id, success: false, error: upsertResult.error })
    return failResult(upsertResult.error)
  }

  await recordSyncResult({
    linkId: link.id,
    success: true,
    campaigns: campaigns as unknown as unknown[],
    performanceMetrics: { campaignsCount: campaigns.length, adSetsCount, adsCount, observationsCount: allObservations.length },
  })

  return {
    success: true,
    error: null,
    accountName: accountResult.data.name,
    campaignsCount: campaigns.length,
    adSetsCount,
    adsCount,
    observationsCount: allObservations.length,
  }
}
