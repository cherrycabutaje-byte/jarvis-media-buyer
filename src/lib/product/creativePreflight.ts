/**
 * Creative Preflight V1
 *
 * Pure, deterministic module - no AI/LLM call of any kind.
 *
 * CTO-DIRECTED FIX: an unknown/unset business_product_type must
 * NEVER be silently treated as PHYSICAL_PRODUCT. This version adds
 * an explicit "Product type known" check and returns NEEDS_INPUT
 * with a customer-actionable reason whenever the type is unset,
 * rather than guessing at media requirements.
 */

import type { HybridDecisionResult } from "@/lib/hybrid/hybridCreativeDecisionEngine"
import type { StaticCreativeSpec } from "@/lib/production/staticCreativeProducer"
import type { ProductTruthProfile } from "@/lib/product/productTruth"

export type PreflightStatus = "READY" | "NEEDS_INPUT" | "GENERATION_REQUIRED" | "BLOCKED"

export interface PreflightCheck {
  label: string
  passed: boolean
  detail: string
}

export interface PreflightResult {
  status: PreflightStatus
  checks: PreflightCheck[]
  generationJustification: string | null
}

export interface RunCreativePreflightInput {
  productTruth: ProductTruthProfile
  hybridDecision: HybridDecisionResult
  spec: StaticCreativeSpec
  selectedAssetsBelongToProduct: boolean
}

export function runCreativePreflight(input: RunCreativePreflightInput): PreflightResult {
  const { productTruth, hybridDecision, spec, selectedAssetsBelongToProduct } = input
  const checks: PreflightCheck[] = []

  const hasProductTruth = productTruth.productName.status === "KNOWN"
  checks.push({
    label: "Product truth available",
    passed: hasProductTruth,
    detail: hasProductTruth ? "Product name is known." : "Product name is not yet known.",
  })

  const productTypeKnown = productTruth.businessProductType.status === "KNOWN"
  checks.push({
    label: "Product type known",
    passed: productTypeKnown,
    detail: productTypeKnown
      ? `Product type: ${productTruth.businessProductType.value}`
      : "Product type has not been set yet - JARVIS cannot confirm what media this product needs without it.",
  })

  const hasCreativeAngle = spec.lineage.creativeAngle.length > 0 && !spec.lineage.creativeAngle.startsWith("UNKNOWN")
  checks.push({
    label: "Creative strategy available",
    passed: hasCreativeAngle,
    detail: hasCreativeAngle ? "A creative angle exists." : "No usable creative angle exists yet.",
  })

  const needsPhysicalVisual = productTypeKnown && productTruth.businessProductType.value === "PHYSICAL_PRODUCT"
  const hasRequiredVisual = !needsPhysicalVisual || productTruth.mediaAvailability.hasProductPhoto
  checks.push({
    label: "Required product visual available",
    passed: hasRequiredVisual,
    detail: hasRequiredVisual
      ? "A real product visual is available where needed."
      : "This is a physical product with no real product photo yet.",
  })

  checks.push({
    label: "Selected assets belong to the correct product/workspace",
    passed: selectedAssetsBelongToProduct,
    detail: selectedAssetsBelongToProduct
      ? "All selected assets are correctly scoped."
      : "One or more selected assets do not belong to this product/workspace.",
  })

  const hasHybridDecision = hybridDecision.decision.length > 0
  checks.push({
    label: "Hybrid Decision exists",
    passed: hasHybridDecision,
    detail: hasHybridDecision ? `Decision: ${hybridDecision.decision}` : "No Hybrid Decision was computed.",
  })

  const productionMethodSupported = spec.supported
  checks.push({
    label: "Production method is supported",
    passed: productionMethodSupported,
    detail: productionMethodSupported
      ? `${spec.productionMethod} is executable deterministically.`
      : `${spec.productionMethod} requires generation not yet performed.`,
  })

  const hasOutputFormat = spec.width > 0 && spec.height > 0
  checks.push({
    label: "Output format/dimensions known",
    passed: hasOutputFormat,
    detail: hasOutputFormat ? `${spec.width}\u00d7${spec.height}` : "Output dimensions are not set.",
  })

  const hasHeadline = spec.headline !== null && spec.headline.length > 0
  checks.push({
    label: "Headline/message exists",
    passed: hasHeadline,
    detail: hasHeadline ? "Headline is present." : "No headline text is available - none was fabricated.",
  })

  const hasCta = spec.cta !== null && spec.cta.length > 0
  checks.push({
    label: "CTA exists",
    passed: hasCta,
    detail: hasCta ? "CTA is present." : "No CTA text is available - none was fabricated.",
  })

  const generationOnlyIfNecessary = spec.supported || spec.missingComponents.length > 0
  checks.push({
    label: "Generation is justified if requested",
    passed: generationOnlyIfNecessary,
    detail: generationOnlyIfNecessary
      ? "Generation, if any, is tied to specific missing components."
      : "Generation would not be justified by any specific evidence.",
  })

  let generationJustification: string | null = null
  if (hybridDecision.decision === "PARTIAL_GENERATION") {
    generationJustification = `Missing: ${spec.missingComponents.join(", ")}. Everything else is preserved from existing material.`
  } else if (hybridDecision.decision === "FULL_GENERATION") {
    generationJustification = `Full generation required because: ${hybridDecision.evidence.join(" ")}`
  }

  let status: PreflightStatus
  const criticalFailures = checks.filter(
    (c) => !c.passed && (c.label === "Selected assets belong to the correct product/workspace" || c.label === "Hybrid Decision exists")
  )

  if (criticalFailures.length > 0) {
    status = "BLOCKED"
  } else if (!productTypeKnown) {
    status = "NEEDS_INPUT"
  } else if (!hasRequiredVisual) {
    status = "NEEDS_INPUT"
  } else if (!productionMethodSupported) {
    status = "GENERATION_REQUIRED"
  } else if (checks.every((c) => c.passed)) {
    status = "READY"
  } else {
    status = "NEEDS_INPUT"
  }

  return { status, checks, generationJustification }
}
