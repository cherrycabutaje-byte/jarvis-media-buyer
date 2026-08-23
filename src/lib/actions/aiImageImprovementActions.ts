"use server"

import { createClient } from "@/lib/supabase/server"
import { getCreativeAssetById, createDerivedCreativeAsset, getExistingDerivedAssetByOperation, setMasterAsset } from "@/lib/repositories/creativeAssetRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { RemoveBgProvider } from "@/lib/product/providers/removeBgProvider"
import type { AIImprovementOperation } from "@/lib/product/providers/aiImageImprovementProvider"

export interface ImproveImageWithAIResult {
  success: boolean
  error: string | null
  derivedAssetId: string | null
  reused: boolean
  setAsMaster: boolean
  providerCallsMade: number
}

/**
 * AI Image Improvement Engine V1 orchestration.
 *
 * ECONOMIC GUARDRAILS: never runs automatically. Idempotency checked
 * FIRST via getExistingDerivedAssetByOperation() - if a prior
 * successful BACKGROUND_REMOVAL derivative exists for this exact
 * source asset, it is reused immediately with providerCallsMade: 0.
 * Ownership verified before any processing.
 *
 * SAFE FAILURE: a failed provider call never creates a derivative
 * row, never touches Master, never leaks provider internals.
 *
 * PRESERVATION: only ever a new INSERT via createDerivedCreativeAsset().
 *
 * MASTER PROMOTION: uses the exact same existing setMasterAsset()
 * mechanism already approved - no new "AI master" concept.
 */
export async function improveImageWithAIAction(assetId: string): Promise<ImproveImageWithAIResult> {
  const operation: AIImprovementOperation = "BACKGROUND_REMOVAL"

  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, error: "You must be logged in.", derivedAssetId: null, reused: false, setAsMaster: false, providerCallsMade: 0 }
  }

  const assetResult = await getCreativeAssetById(assetId)
  if (assetResult.error || !assetResult.data) {
    return { success: false, error: assetResult.error ?? "Asset not found.", derivedAssetId: null, reused: false, setAsMaster: false, providerCallsMade: 0 }
  }
  const asset = assetResult.data

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === asset.workspace_id)
  if (!isMember) {
    return { success: false, error: "You are not authorized to modify this asset.", derivedAssetId: null, reused: false, setAsMaster: false, providerCallsMade: 0 }
  }

  const existing = await getExistingDerivedAssetByOperation(assetId, operation)
  if (existing.data) {
    return { success: true, error: null, derivedAssetId: existing.data.id, reused: true, setAsMaster: false, providerCallsMade: 0 }
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("creative-library")
    .createSignedUrl(asset.storage_path, 300)

  if (signedUrlError || !signedUrlData) {
    return { success: false, error: "Could not access the source image.", derivedAssetId: null, reused: false, setAsMaster: false, providerCallsMade: 0 }
  }

  const provider = new RemoveBgProvider()
  const result = await provider.improve({
    sourceImageUrl: signedUrlData.signedUrl,
    operation,
    preserveProductIdentity: true,
  })

  if (!result.success || !result.imageBytes) {
    return { success: false, error: result.error ?? "Image improvement failed.", derivedAssetId: null, reused: false, setAsMaster: false, providerCallsMade: 1 }
  }

  const derivedStoragePath = `${asset.workspace_id}/${crypto.randomUUID()}-ai-improved.png`
  const { error: uploadError } = await supabase.storage
    .from("creative-library")
    .upload(derivedStoragePath, result.imageBytes, { contentType: "image/png", upsert: false })

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}`, derivedAssetId: null, reused: false, setAsMaster: false, providerCallsMade: 1 }
  }

  const createResult = await createDerivedCreativeAsset({
    workspaceId: asset.workspace_id,
    brandId: asset.brand_id,
    productId: asset.product_id,
    category: asset.category,
    storagePath: derivedStoragePath,
    mimeType: "image/png",
    fileSizeBytes: result.imageBytes.byteLength,
    widthPx: asset.width_px,
    heightPx: asset.height_px,
    uploadedBy: userData.user.id,
    derivedFromAssetId: assetId,
    processingMetadata: {
      operation,
      aiUsed: true,
      provider: result.providerMetadata?.provider ?? "remove.bg",
      providerRequestId: result.providerMetadata?.providerRequestId ?? null,
      estimatedCostUsd: result.providerMetadata?.estimatedCostUsd ?? null,
      generationCalls: 1,
      preservedProductIdentity: true,
    },
  })

  if (createResult.error || !createResult.data) {
    await supabase.storage.from("creative-library").remove([derivedStoragePath])
    return { success: false, error: createResult.error ?? "Failed to save the improved image.", derivedAssetId: null, reused: false, setAsMaster: false, providerCallsMade: 1 }
  }

  let setAsMaster = false
  if (asset.product_id) {
    const masterResult = await setMasterAsset(asset.product_id, createResult.data.id)
    setAsMaster = !masterResult.error
  }

  return { success: true, error: null, derivedAssetId: createResult.data.id, reused: false, setAsMaster, providerCallsMade: 1 }
}
