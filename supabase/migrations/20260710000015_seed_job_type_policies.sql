-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 015_seed_job_type_policies
-- Additive seed data - not a schema change
--
-- Populates job_type_policies, the reference/configuration table
-- that jobs.max_attempts is copied from at job creation time.
-- This table was confirmed empty (0 rows) via live inspection on
-- 2026-07-11, which blocked the Provider Adapter Layer's first
-- vertical slice (job creation requires a policy row to exist for
-- the job_type being created). This is a missing seed-data
-- dependency, not an architectural defect - the schema itself
-- (migration 006) is correct and unchanged here.
--
-- Only job_type_policies is seeded in this migration. providers
-- and publishing_platforms remain intentionally unseeded - they
-- belong to their own future implementation milestones (Provider
-- Adapter Slice covering real providers, and the Publishing phase,
-- respectively) and were explicitly excluded from this migration's
-- scope.
--
-- SOURCE OF VALUES, stated precisely per row:
--
-- text_generation, image_generation, video_generation, and
-- asset_assembly: these four rows use the exact values that
-- appeared in the original Component 5 (Job Queue & Execution
-- Orchestration) design validation testing, performed when
-- migration 006 was originally built and frozen. This is a real,
-- confirmed historical source - not invented now. The max_attempts
-- values specifically match the original design reasoning verbatim
-- ("text and image generation get three attempts, video gets two
-- due to cost, and asset assembly gets three").
--
-- publish_asset: this job_type did not exist when Component 5 was
-- designed - it was added later, as an additive ALTER TYPE, in
-- Component 8 (Publishing Layer). No historical source specifies
-- policy values for it. Its row below is a VERSION 1.0 OPERATIONAL
-- DEFAULT ONLY, proposed by analogy to image_generation (external
-- API call, moderate timeout/backoff for rate-limit-style
-- failures), NOT a value sourced from any prior design document.
-- It is expected to be tuned later using real production metrics
-- once publishing actually goes live, not treated as a permanent
-- architectural constant.
-- ============================================================

insert into job_type_policies (job_type, max_attempts, timeout_seconds, base_backoff_seconds) values
  ('text_generation',  3, 30,  1),
  ('image_generation', 3, 60,  2),
  ('video_generation', 2, 300, 5),
  ('asset_assembly',   3, 15,  1),
  ('publish_asset',    3, 60,  5);