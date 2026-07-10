/**
 * JARVIS Brain - Core Type Definitions
 * Architecture V4.3 Engineering Baseline
 *
 * DEPENDENCY RULE: Types flow top to bottom only.
 * No module may import a module later in the chain.
 * No circular dependencies permitted.
 */

// ============================================================
// INPUT TYPES - Raw data entering the JARVIS Brain
// ============================================================

export interface BusinessInput {
  productName: string;
  productDescription: string;
  price?: string;
  url?: string;
  category?: string;
  knownAudience?: string;
  keyFeatures?: string[];
  existingCopy?: { headline?: string; body?: string; cta?: string; };
}

export interface CompetitorInput {
  identifier: string;
  headline?: string;
  bodyCopy?: string;
  price?: string;
  claims?: string[];
}

export interface BrandContext {
  voice?: string[];
  colors?: string[];
  fonts?: string[];
  values?: string[];
}

// ============================================================
// INTELLIGENCE OBJECTS - JARVIS Brain module outputs
// Flow: Business -> Audience -> Competitor -> Offer ->
//       Positioning -> Messaging -> Creative -> Campaign
// ============================================================

export interface BusinessIntelligenceObject {
  readonly _module: "BusinessIntelligence";
  coreValueProposition: string;
  offerStrengthScore: number;
  keyDifferentiators: string[];
  primaryWeaknesses: string[];
  pricePositioning: "premium" | "mid-market" | "budget" | "value";
  resolvedCategory: string;
}

export interface AudienceIntelligenceObject {
  readonly _module: "AudienceIntelligence";
  primaryPersona: string;
  primaryEmotion: string;
  purchaseTrigger: string;
  coreObjections: string[];
  awarenessLevel: "unaware" | "problem-aware" | "solution-aware" | "product-aware" | "most-aware";
  identityMotivation: string;
  deepestFear: string;
}

export interface CompetitorIntelligenceObject {
  readonly _module: "CompetitorIntelligence";
  competitorAngle: string;
  competitorWeakness: string;
  whiteSpaceOpportunity: string;
  counterPositioning: string;
  unfairAdvantage: string;
}

export interface OfferIntelligenceObject {
  readonly _module: "OfferIntelligence";
  offerFrame: string;
  valueStackClarity: string;
  priceJustificationStrategy: string;
  riskReversalRecommendation: string;
  urgencyMechanism: string;
}

export interface PositioningDecisionObject {
  winningAngle: string;
  positioningStatement: string;
  categoryReframe: string;
  differentiationStrategy: string;
}

export interface MessagingStrategyObject {
  coreMessage: string;
  headlineDirection: string;
  hookStrategy: string;
  ctaDirection: string;
  toneOfVoice: string[];
  mustSay: string[];
  mustNotSay: string[];
}

export interface CreativeStrategyObject {
  creativeAngle: string;
  formatRecommendations: Record<string, string>;
  visualDirection: string;
  storyArc: string;
  emotionalJourney: string[];
}

// ============================================================
// CAMPAIGN TYPES
// ============================================================

export type MarketingFramework =
  | "fear-relief"
  | "identity-transformation"
  | "social-proof"
  | "curiosity"
  | "direct-benefit"
  | "contrarian"
  | "story"
  | "comparison";

export interface VariationDefinition {
  id: string;
  label: string;
  framework: MarketingFramework;
  emotionalAngle: string;
  audienceSegment: string;
  visualConcept: string;
  confidenceScore: number;
}

export interface CampaignArchitectureObject {
  campaignName: string;
  campaignType: ProductType;
  totalVariations: number;
  variations: VariationDefinition[];
}

export interface VariationStrategyPackage {
  variationId: string;
  variationDefinition: VariationDefinition;
  textStrategyBrief: TextStrategyBrief;
  imageCreativeBrief: ImageCreativeBrief;
}

export interface CampaignIntelligenceObject {
  recommendedVariation: string;
  confidenceScore: number;
  recommendationReasons: string[];
  testingStrategy: { phase1: string; phase2: string; phase3: string; };
  predictedPerformance: Record<string, { predictedCTR: string; audienceType: string; }>;
}

// ============================================================
// PRODUCT TYPES
// ============================================================

export type ProductType =
  | "static-advertisement"
  | "video-advertisement"
  | "carousel-advertisement"
  | "story-advertisement"
  | "landing-page"
  | "email-campaign"
  | "google-ads"
  | "instagram-campaign"
  | "ugc-package"
  | "facebook-campaign"
  | "product-launch-kit"
  | "brand-kit";

export type ProviderType = "text" | "image" | "video" | "speech" | "translation" | "embedding";

export interface ProductStructureObject {
  productType: ProductType;
  variationCount: number;
  textComponents: string[];
  imageComponents: string[];
  videoComponents: string[];
  sharedComponents: string[];
  outputFormats: string[];
  providersRequired: ProviderType[];
}

export interface PackageDefinitionObject {
  requiredComponents: string[];
  downloadFormats: string[];
  includedDocuments: string[];
  isProductionReady: boolean;
  externalToolsRequired: [];
}

export interface DecisionRecord {
  assetPriority: string[];
  leadAngle: string;
  primaryObjectionToAddress: string;
  decisionLog: Array<{ decision: string; reason: string; module: string; }>;
}

// ============================================================
// BRIEF TYPES - Sent to providers only
// Claude receives TextStrategyBrief ONLY
// Image provider receives ImageCreativeBrief ONLY
// ============================================================

export interface TextStrategyBrief {
  assetType: string;
  variationId: string;
  audience: string;
  primaryEmotion: string;
  angle: string;
  toneOfVoice: string[];
  whatToSay: string[];
  whatNotToSay: string[];
  format: { platform?: string; components: string[]; lengthGuidance: string; };
  language: string;
}

export interface ImageCreativeBrief {
  variationId: string;
  emotion: string;
  visualStyle: string;
  subject: string;
  subjectAction: string;
  background: string;
  lighting: string;
  composition: string;
  negativeSpace: string;
  brandColors: string[];
  platform: string;
  aspectRatio: string;
  mood: string[];
}

export interface ImagePromptObject {
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  quality: "standard" | "high";
  style: "photographic" | "illustration" | "digital-art";
}

// ============================================================
// INTELLIGENCE PIPELINE - Full brain execution result
// ============================================================

export interface IntelligencePipeline {
  business: BusinessIntelligenceObject;
  audience: AudienceIntelligenceObject;
  competitor?: CompetitorIntelligenceObject;
  offer: OfferIntelligenceObject;
  positioning: PositioningDecisionObject;
  messaging: MessagingStrategyObject;
  creative: CreativeStrategyObject;
  decisions: DecisionRecord;
}
export interface ProviderPrompt {
  systemPrompt: string;
  userPrompt: string;
  outputFormat: string;
  constraints: string[];
  variables: Record<string, string>;
  language: string;
  expectedDeliverables: string[];
  metadata: {
    variationId: string;
    productType: string;
    assetType: string;
  };
}

export interface IntelligenceModuleResult<T> {
  module: string;
  status: "complete" | "partial" | "unknown";
  confidence: number;
  evidence: string[];
  unknowns: string[];
  recommendationsForNext: string[];
  findings: T;
}

export type ModuleStatus = "complete" | "partial" | "unknown";
