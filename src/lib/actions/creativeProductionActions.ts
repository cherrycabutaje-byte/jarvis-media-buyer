"use server"

import { createClient } from "@/lib/supabase/server"
import { getProductById } from "@/lib/repositories/productRepository"
import { getBrainRunById } from "@/lib/repositories/brainRunRepository"
import { getCreativeAssetsForWorkspace } from "@/lib/repositories/creativeAssetRepository"
import { getFirstAssetForProduct, createNextAssetVersion } from "@/lib/repositories/assetRepository"
import {
  decideCreativeProductionMethod,
  parseCreativeRequirement,
  type CreativeAssetEvidence,
} from "@/lib/hybrid/hybridCreativeDecisionEngine"
import { buildStaticCreativeSpec, type StaticCreativeSpec } from "@/lib/production/staticCreativeProducer"
import { renderStaticCreative } from "@/lib/production/renderStaticCreative"

export interface ProduceCreativeResult {
  success: boolean
  error: string | null
  spec: StaticCreativeSpec | null
  finishedAssetId: string | null
  previewUrl: string | null
}

/**
 * Creative Production Engine V1 orchestration.
 *
 * CTO-DIRECTED FIX (post-review): previously used createFirstAsset(),
 * which only ever creates version_number = 1 and therefore blocked
 * any product that already had a finished asset (e.g. a prior
 * text-generation asset) from ever receiving a static creative.
 * Now uses createNextAssetVersion(), which safely creates whatever
 * version comes next - including version 1 for a genuinely new
 * product - via a concurrency-safe SECURITY DEFINER database
 * function (migration 20260819000002). The previous
 * hasExistingAsset() blocking check has been removed entirely,
 * since creating a subsequent version for a product that already
 * has assets is now the explicitly supported, intended behavior -
 * not an error case.
 *
 * This NEVER overwrites, mutates, or replaces any existing asset -
 * every call inserts one new, independent row. Prior approved/
 * published versions are structurally unaffected (the frozen
 * approval/immutability triggers only fire on UPDATE, never on the
 * INSERT this function performs).
 *
 * Server Action, using the human-session server client throughout
 * (never service-role) - the Storage upload for the finished
 * creative is protected by the exact same RLS as the Creative
 * Library uploader, just executed server-side instead of
 * client-side, with the logged-in user's own admin membership
 * required. Re-computes the Hybrid Decision fresh, server-side,
 * rather than trusting any client-supplied decision - defense in
 * depth, consistent with this project's established convention.
 *
 * ZERO AI/GENERATION CALLS: this entire pipeline - decision,
 * spec-building, rendering (next/og's ImageResponse, a deterministic
 * satori+resvg rasterizer) - makes no OpenAI, Anthropic, image-
 * generation, video-generation, or Meta call of any kind.
 */
export async function produceCreativeAction(productId: string): Promise<ProduceCreativeResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, error: "You must be logged in.", spec: null, finishedAssetId: null, previewUrl: null }
  }

  const productResult = await getProductById(productId)
  if (productResult.error || !productResult.data) {
    return { success: false, error: productResult.error ?? "Product not found.", spec: null, finishedAssetId: null, previewUrl: null }
  }
  const product = productResult.data

  if (!product.brain_run_id) {
    return { success: false, error: "This product isn't linked to a completed analysis yet.", spec: null, finishedAssetId: null, previewUrl: null }
  }

  const brainRunResult = await getBrainRunById(product.brain_run_id)
  if (brainRunResult.error || !brainRunResult.data) {
    return { success: false, error: brainRunResult.error ?? "Analysis unavailable.", spec: null, finishedAssetId: null, previewUrl: null }
  }

  const pipeline = brainRunResult.data.intelligence_pipeline as unknown as {
    creativeStrategy?: {
      status: "complete" | "partial" | "unknown"
      confidence: number
      findings: { creativeAngle: string; visualDirection: string; formatRecommendations: { assetType?: string } }
    }
  }

  if (!pipeline.creativeStrategy) {
    return { success: false, error: "This product's analysis is missing creative strategy data.", spec: null, finishedAssetId: null, previewUrl: null }
  }

  const requirement = parseCreativeRequirement(pipeline.creativeStrategy)

  const assetsResult = await getCreativeAssetsForWorkspace(product.workspace_id)
  const rawAssets = assetsResult.data ?? []
  const evidence: CreativeAssetEvidence[] = rawAssets.map((a) => ({
    id: a.id,
    category: a.category,
    sourceType: a.source_type,
    mimeType: a.mime_type,
    widthPx: a.width_px,
    heightPx: a.height_px,
    durationSeconds: a.duration_seconds,
    productId: a.product_id,
    brandId: a.brand_id,
    workspaceId: a.workspace_id,
    originalFilename: a.original_filename,
    createdAt: a.created_at,
    isMaster: a.is_master,
  }))

  const hybridDecision = decideCreativeProductionMethod(requirement, evidence, {
    workspaceId: product.workspace_id,
    productId: product.id,
    brandId: product.brand_id,
  })

  const existingAssetResult = await getFirstAssetForProduct(product.id)
  const existingAdCopy =
    existingAssetResult.data && typeof existingAssetResult.data.asset_payload?.rawText === "string"
      ? (existingAssetResult.data.asset_payload.rawText as string)
      : null

  const selectedAssets = rawAssets.filter((a) => hybridDecision.selectedAssetIds.includes(a.id))
  const productImageAsset = selectedAssets.find((a) => a.category === "product_image" || a.category === "previous_creative")
  const logoAsset = selectedAssets.find((a) => a.category === "brand_asset")

  const spec = buildStaticCreativeSpec({
    hybridDecision,
    creativeAngle: pipeline.creativeStrategy.findings.creativeAngle,
    existingAdCopy,
    productImageAssetId: productImageAsset?.id ?? null,
    logoAssetId: logoAsset?.id ?? null,
  })

  if (!spec.supported) {
    return { success: true, error: null, spec, finishedAssetId: null, previewUrl: null }
  }

  let productImageSignedUrl: string | null = null
  let logoSignedUrl: string | null = null

  if (productImageAsset) {
    const { data } = await supabase.storage.from("creative-library").createSignedUrl(productImageAsset.storage_path, 300)
    productImageSignedUrl = data?.signedUrl ?? null
  }
  if (logoAsset) {
    const { data } = await supabase.storage.from("creative-library").createSignedUrl(logoAsset.storage_path, 300)
    logoSignedUrl = data?.signedUrl ?? null
  }

  let pngBuffer: ArrayBuffer
  try {
    pngBuffer = await renderStaticCreative({
      spec,
      productImageSignedUrl,
      logoSignedUrl,
    })
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Rendering failed.",
      spec,
      finishedAssetId: null,
      previewUrl: null,
    }
  }

  const finishedStoragePath = `${product.workspace_id}/${crypto.randomUUID()}.png`
  const { error: uploadError } = await supabase.storage
    .from("finished-creatives")
    .upload(finishedStoragePath, pngBuffer, { contentType: "image/png", upsert: false })

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}`, spec, finishedAssetId: null, previewUrl: null }
  }

  const assetPayload: Record<string, unknown> = {
    outputType: "static-image",
    storagePath: finishedStoragePath,
    width: spec.width,
    height: spec.height,
    productionMethod: spec.productionMethod,
    layoutTemplate: spec.layoutTemplate,
    headline: spec.headline,
    cta: spec.cta,
    lineage: spec.lineage,
    costEvidence: spec.costEvidence,
  }

  const createResult = await createNextAssetVersion({
    productId: product.id,
    architectureVersion: brainRunResult.data.architecture_version,
    assetPayload,
    assembledByJobId: null,
  })

  if (createResult.error || !createResult.data) {
    await supabase.storage.from("finished-creatives").remove([finishedStoragePath])
    return { success: false, error: createResult.error ?? "Failed to save the finished creative.", spec, finishedAssetId: null, previewUrl: null }
  }

  const { data: previewSignedData } = await supabase.storage
    .from("finished-creatives")
    .createSignedUrl(finishedStoragePath, 3600)

  return {
    success: true,
    error: null,
    spec,
    finishedAssetId: createResult.data.id,
    previewUrl: previewSignedData?.signedUrl ?? null,
  }
}
