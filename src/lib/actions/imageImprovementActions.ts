"use server"

import { createClient } from "@/lib/supabase/server"
import { getCreativeAssetById, createDerivedCreativeAsset, getExistingDerivedAsset, setMasterAsset } from "@/lib/repositories/creativeAssetRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { decideImageImprovement, type ImageImprovementResult } from "@/lib/product/imageImprovement"
import { renderDeterministicImprovement } from "@/lib/product/renderImageImprovement"

export interface PrepareProductImageResult {
  success: boolean
  error: string | null
  improvement: ImageImprovementResult | null
  derivedAssetId: string | null
  setAsMaster: boolean
}

/**
 * Image Improvement Engine V1 orchestration.
 *
 * ZERO AI CALLS: decideImageImprovement is pure/deterministic;
 * renderDeterministicImprovement uses next/og's ImageResponse
 * (satori + resvg - deterministic rasterization, not an AI model) -
 * the exact same mechanism already proven and CTO-approved in
 * renderStaticCreative.ts.
 *
 * REUSE BEFORE REPROCESSING: checks getExistingDerivedAsset() first.
 *
 * PRESERVATION: never overwrites, mutates, or deletes the original
 * asset row or its storage object - only ever creates a new,
 * independent derivative row.
 */
export async function prepareProductImageAction(assetId: string): Promise<PrepareProductImageResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, error: "You must be logged in.", improvement: null, derivedAssetId: null, setAsMaster: false }
  }

  const assetResult = await getCreativeAssetById(assetId)
  if (assetResult.error || !assetResult.data) {
    return { success: false, error: assetResult.error ?? "Asset not found.", improvement: null, derivedAssetId: null, setAsMaster: false }
  }
  const asset = assetResult.data

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === asset.workspace_id)
  if (!isMember) {
    return { success: false, error: "You are not authorized to modify this asset.", improvement: null, derivedAssetId: null, setAsMaster: false }
  }

  const improvement = decideImageImprovement({
    widthPx: asset.width_px,
    heightPx: asset.height_px,
    fileSizeBytes: asset.file_size_bytes,
    mimeType: asset.mime_type,
  })

  if (improvement.decision === "USE_AS_IS" || improvement.decision === "AI_IMPROVEMENT_REQUIRED" || improvement.decision === "REPLACEMENT_RECOMMENDED") {
    return { success: true, error: null, improvement, derivedAssetId: null, setAsMaster: false }
  }

  const existingDerived = await getExistingDerivedAsset(assetId)
  if (existingDerived.data) {
    return { success: true, error: null, improvement, derivedAssetId: existingDerived.data.id, setAsMaster: false }
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("creative-library")
    .createSignedUrl(asset.storage_path, 300)

  if (signedUrlError || !signedUrlData) {
    return { success: false, error: "Could not access the source image.", improvement, derivedAssetId: null, setAsMaster: false }
  }

  const targetMaxDimension = improvement.targetMaxDimension ?? 1080
  const preserveTransparency = asset.mime_type === "image/png"

  let pngBuffer: ArrayBuffer
  try {
    pngBuffer = await renderDeterministicImprovement({
      sourceUrl: signedUrlData.signedUrl,
      targetMaxDimension,
      preserveTransparency,
    })
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Processing failed.",
      improvement,
      derivedAssetId: null,
      setAsMaster: false,
    }
  }

  const derivedStoragePath = `${asset.workspace_id}/${crypto.randomUUID()}-improved.png`
  const { error: uploadError } = await supabase.storage
    .from("creative-library")
    .upload(derivedStoragePath, pngBuffer, { contentType: "image/png", upsert: false })

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}`, improvement, derivedAssetId: null, setAsMaster: false }
  }

  const createResult = await createDerivedCreativeAsset({
    workspaceId: asset.workspace_id,
    brandId: asset.brand_id,
    productId: asset.product_id,
    category: asset.category,
    storagePath: derivedStoragePath,
    mimeType: "image/png",
    fileSizeBytes: pngBuffer.byteLength,
    widthPx: targetMaxDimension,
    heightPx: targetMaxDimension,
    uploadedBy: userData.user.id,
    derivedFromAssetId: assetId,
    processingMetadata: {
      operations: improvement.deterministicOperations,
      reasons: improvement.reasons,
      sourceWidth: asset.width_px,
      sourceHeight: asset.height_px,
      generationCalls: 0,
      imageGenerationCalls: 0,
      videoGenerationCalls: 0,
    },
  })

  if (createResult.error || !createResult.data) {
    await supabase.storage.from("creative-library").remove([derivedStoragePath])
    return { success: false, error: createResult.error ?? "Failed to save the improved image.", improvement, derivedAssetId: null, setAsMaster: false }
  }

  let setAsMaster = false
  if (asset.product_id) {
    const masterResult = await setMasterAsset(asset.product_id, createResult.data.id)
    setAsMaster = !masterResult.error
  }

  return { success: true, error: null, improvement, derivedAssetId: createResult.data.id, setAsMaster }
}
