-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260821000001_image_improvement_engine
-- Additive only - no destructive changes.
--
-- Image Improvement Engine V1 slice.
--
-- INSPECTION FINDINGS: creative_assets.source_type currently only
-- has 'customer_upload' and 'previous_creative' - neither honestly
-- describes a derivative JARVIS itself produced via deterministic
-- processing. A new enum value is genuinely required. No existing
-- column can hold lineage (which original asset a derivative came
-- from, what operations were performed) - two new nullable columns
-- are the smallest safe additive fix.
--
-- Deliberately does NOT touch is_master, Master Asset selection,
-- Creative Preflight, or the Hybrid Decision Engine - all of that
-- already correctly handles an improved derivative once it becomes
-- master (indistinguishable from any other good product photo),
-- requiring zero changes to already-frozen/approved code.
-- ============================================================

alter type creative_asset_source add value 'jarvis_processed';

alter table creative_assets add column derived_from_asset_id uuid references creative_assets(id) on delete set null;
alter table creative_assets add column processing_metadata jsonb;
