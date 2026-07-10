-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 002_add_viewer_role
-- Split from the Identity & Authorization migration due to a
-- PostgreSQL restriction: a newly added enum value cannot be
-- referenced within the same transaction it was added in.
-- Isolating this addition into its own migration lets the
-- renamed 003_identity_authorization migration safely reference
-- 'viewer' afterward, since it will already be committed.
-- ============================================================

alter type workspace_role add value 'viewer';