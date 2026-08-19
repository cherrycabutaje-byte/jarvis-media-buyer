/**
 * Product Truth Profile V1
 *
 * ARCHITECTURAL NOTE:
 * Pure, deterministic module - no AI calls, no database access, no
 * network calls. Assembles a reliable factual basis for a product
 * from data JARVIS ALREADY has, never inventing or rediscovering
 * facts via an LLM. Every fact is explicitly marked KNOWN, UNKNOWN,
 * or NOT_APPLICABLE - never silently guessed or defaulted to a
 * plausible-looking value.
 *
 * REUSE, NOT DUPLICATION: productName and description are read
 * directly from brain_runs.business_input (confirmed, by direct
 * inspection, to already contain real
 * {productName, productDescription} for every product in this
 * project) - never re-stored anywhere. "Approved claims" and
 * "benefits" are treated honestly: keyDifferentiators from
 * BusinessIntelligenceObject is real, already-computed AI strategic
 * output, but it is NOT a customer-approved claims list (no
 * approval workflow for claims exists anywhere in this project) -
 * it is labeled as strategicDifferentiators, and approvedClaims is
 * reported UNKNOWN, never conflated with it.
 *
 * price, businessProductType, and productUrl are read from three
 * new nullable columns added to `products` in this slice - genuinely
 * new facts with no prior source, honestly UNKNOWN when not yet
 * supplied by the customer.
 */

export type FactStatus = "KNOWN" | "UNKNOWN" | "NOT_APPLICABLE"

export interface ProductFact<T> {
  status: FactStatus
  value: T | null
}

export type BusinessProductType = "PHYSICAL_PRODUCT" | "SERVICE" | "SAAS_APP" | "DIGITAL_PRODUCT"

export interface ProductMediaAvailability {
  hasProductPhoto: boolean
  hasLogo: boolean
  hasVideo: boolean
  hasScreenshot: boolean
  totalAssetCount: number
}

export interface ProductTruthProfile {
  productName: ProductFact<string>
  brandName: ProductFact<string>
  businessProductType: ProductFact<BusinessProductType>
  description: ProductFact<string>
  strategicDifferentiators: ProductFact<string[]>
  offerSummary: ProductFact<string>
  price: ProductFact<string>
  approvedClaims: ProductFact<string[]>
  targetAudienceSummary: ProductFact<string>
  productUrl: ProductFact<string>
  mediaAvailability: ProductMediaAvailability
}

const VALID_BUSINESS_PRODUCT_TYPES: BusinessProductType[] = [
  "PHYSICAL_PRODUCT",
  "SERVICE",
  "SAAS_APP",
  "DIGITAL_PRODUCT",
]

function known<T>(value: T): ProductFact<T> {
  return { status: "KNOWN", value }
}

function unknown<T>(): ProductFact<T> {
  return { status: "UNKNOWN", value: null }
}

export interface BuildProductTruthProfileInput {
  brandName: string
  businessInput: { productName?: string; productDescription?: string } | null
  businessProductType: string | null
  price: string | null
  productUrl: string | null
  businessIntelligence: { keyDifferentiators: string[] } | null
  offerIntelligence: { offerFrame: string } | null
  audienceIntelligence: { primaryPersona: string } | null
  mediaAssets: { category: string }[]
}

export function buildProductTruthProfile(input: BuildProductTruthProfileInput): ProductTruthProfile {
  const {
    brandName,
    businessInput,
    businessProductType,
    price,
    productUrl,
    businessIntelligence,
    offerIntelligence,
    audienceIntelligence,
    mediaAssets,
  } = input

  const parsedBusinessProductType =
    businessProductType && VALID_BUSINESS_PRODUCT_TYPES.includes(businessProductType as BusinessProductType)
      ? (businessProductType as BusinessProductType)
      : null

  const mediaAvailability: ProductMediaAvailability = {
    hasProductPhoto: mediaAssets.some((a) => a.category === "product_image" || a.category === "product_in_use"),
    hasLogo: mediaAssets.some((a) => a.category === "brand_asset"),
    hasVideo: mediaAssets.some((a) => a.category === "video"),
    hasScreenshot: mediaAssets.some((a) => a.category === "screenshot"),
    totalAssetCount: mediaAssets.length,
  }

  return {
    productName: businessInput?.productName ? known(businessInput.productName) : unknown(),
    brandName: brandName ? known(brandName) : unknown(),
    businessProductType: parsedBusinessProductType ? known(parsedBusinessProductType) : unknown(),
    description: businessInput?.productDescription ? known(businessInput.productDescription) : unknown(),
    strategicDifferentiators:
      businessIntelligence && businessIntelligence.keyDifferentiators.length > 0
        ? known(businessIntelligence.keyDifferentiators)
        : unknown(),
    offerSummary:
      offerIntelligence && !offerIntelligence.offerFrame.startsWith("UNKNOWN")
        ? known(offerIntelligence.offerFrame)
        : unknown(),
    price: price ? known(price) : unknown(),
    approvedClaims: unknown(),
    targetAudienceSummary:
      audienceIntelligence && !audienceIntelligence.primaryPersona.startsWith("UNKNOWN")
        ? known(audienceIntelligence.primaryPersona)
        : unknown(),
    productUrl: productUrl ? known(productUrl) : unknown(),
    mediaAvailability,
  }
}
