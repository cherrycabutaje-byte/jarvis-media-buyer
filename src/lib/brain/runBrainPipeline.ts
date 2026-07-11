import { analyzeBusinessIntelligence } from "@/lib/jarvis-brain/businessIntelligence";
import { analyzeAudienceIntelligence } from "@/lib/jarvis-brain/audienceIntelligence";
import { analyzeCompetitorIntelligence } from "@/lib/jarvis-brain/competitorIntelligence";
import { analyzeOfferIntelligence } from "@/lib/jarvis-brain/offerIntelligence";
import { decidePositioning } from "@/lib/jarvis-brain/positioningEngine";
import { decideMessagingStrategy } from "@/lib/jarvis-brain/messagingStrategy";
import { decideCreativeStrategy } from "@/lib/jarvis-brain/creativeStrategy";
import { decideCampaignArchitecture } from "@/lib/jarvis-brain/campaignArchitectureEngine";
import { planVariationExecution } from "@/lib/jarvis-brain/variationEngine";
import { evaluateCampaignIntelligence } from "@/lib/jarvis-brain/campaignIntelligenceEngine";
import type {
  BusinessInput,
  CompetitorInput,
  IntelligenceModuleResult,
  BusinessIntelligenceObject,
  AudienceIntelligenceObject,
  CompetitorIntelligenceObject,
  OfferIntelligenceObject,
  PositioningDecisionObject,
  MessagingStrategyObject,
  CreativeStrategyObject,
  CampaignArchitectureObject,
  VariationStrategyPackage,
  CampaignIntelligenceObject,
} from "@/lib/jarvis-brain/types";

/**
 * The complete, typed output of one Brain pipeline execution - modules
 * 1-10 (Intelligence, Decision, and Optimization Layers) only. Builder
 * Layer modules (11-16) are explicitly out of scope; they consume a
 * brain_run as input in a future vertical slice, they do not produce
 * one.
 */
export interface BrainPipelineOutput {
  businessIntelligence: IntelligenceModuleResult<BusinessIntelligenceObject>;
  audienceIntelligence: IntelligenceModuleResult<AudienceIntelligenceObject>;
  competitorIntelligence: IntelligenceModuleResult<CompetitorIntelligenceObject>;
  offerIntelligence: IntelligenceModuleResult<OfferIntelligenceObject>;
  positioningDecision: IntelligenceModuleResult<PositioningDecisionObject>;
  messagingStrategy: IntelligenceModuleResult<MessagingStrategyObject>;
  creativeStrategy: IntelligenceModuleResult<CreativeStrategyObject>;
  campaignArchitecture: IntelligenceModuleResult<CampaignArchitectureObject>;
  variations: IntelligenceModuleResult<VariationStrategyPackage>[];
  campaignIntelligence: IntelligenceModuleResult<CampaignIntelligenceObject>;
}

/**
 * Runs the frozen Brain pipeline (modules 1-10) in the exact sequence
 * their real signatures require - verified directly against the
 * current source files, not assumed from memory. Two dependency
 * details worth noting explicitly, since they contradict what a
 * simpler "each module needs everything before it" assumption would
 * suggest:
 *
 * - analyzeCompetitorIntelligence takes only `business` and a raw
 *   competitors array - not `audience`.
 * - evaluateCampaignIntelligence (module 10) does not depend on
 *   planVariationExecution (module 9) at all. Both branch
 *   independently off modules 1-8's output.
 *
 * Architectural rule: this function is pure and deterministic.
 * No Supabase. No repositories. No persistence. No AI provider calls.
 * It receives input and returns typed output only - persistence is
 * the caller's responsibility (BrainRunRepository, via a Server
 * Action), not this function's.
 */
export function runBrainPipeline(
  input: BusinessInput,
  competitors: CompetitorInput[] = []
): BrainPipelineOutput {
  const businessIntelligence = analyzeBusinessIntelligence(input);
  const audienceIntelligence = analyzeAudienceIntelligence(businessIntelligence);
  const competitorIntelligence = analyzeCompetitorIntelligence(businessIntelligence, competitors);
  const offerIntelligence = analyzeOfferIntelligence(
    businessIntelligence,
    audienceIntelligence,
    competitorIntelligence
  );
  const positioningDecision = decidePositioning(
    businessIntelligence,
    audienceIntelligence,
    competitorIntelligence,
    offerIntelligence
  );
  const messagingStrategy = decideMessagingStrategy(
    businessIntelligence,
    audienceIntelligence,
    competitorIntelligence,
    offerIntelligence,
    positioningDecision
  );
  const creativeStrategy = decideCreativeStrategy(
    businessIntelligence,
    audienceIntelligence,
    competitorIntelligence,
    offerIntelligence,
    positioningDecision,
    messagingStrategy
  );
  const campaignArchitecture = decideCampaignArchitecture(
    businessIntelligence,
    audienceIntelligence,
    competitorIntelligence,
    offerIntelligence,
    positioningDecision,
    messagingStrategy,
    creativeStrategy
  );

  const variations = campaignArchitecture.findings.variations.map((variationDefinition) =>
    planVariationExecution(
      businessIntelligence,
      audienceIntelligence,
      competitorIntelligence,
      offerIntelligence,
      positioningDecision,
      messagingStrategy,
      creativeStrategy,
      campaignArchitecture,
      variationDefinition.id
    )
  );

  const campaignIntelligence = evaluateCampaignIntelligence(
    businessIntelligence,
    audienceIntelligence,
    competitorIntelligence,
    offerIntelligence,
    positioningDecision,
    messagingStrategy,
    creativeStrategy,
    campaignArchitecture
  );

  return {
    businessIntelligence,
    audienceIntelligence,
    competitorIntelligence,
    offerIntelligence,
    positioningDecision,
    messagingStrategy,
    creativeStrategy,
    campaignArchitecture,
    variations,
    campaignIntelligence,
  };
}