-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 014_products_update_policy
-- Additive fix - Database Version 1.0 defect correction
--
-- Genuine defect discovered during Repository Layer implementation
-- (ProductRepository) and confirmed as a blocking issue at the start
-- of the Builder Layer phase: the frozen Identity & Authorization
-- migration (003) defined SELECT, INSERT, and DELETE policies for
-- products, but never an UPDATE policy. This meant no authenticated
-- role - not even owner - could successfully update a product's
-- content, since Postgres RLS denies by default when no policy
-- matches the attempted action.
--
-- This is ordinary CRUD, not a bootstrap problem - per the recorded
-- architectural rule, the correct fix is a normal RLS policy, not a
-- SECURITY DEFINER function. This migration adds exactly one policy,
-- mirroring admins_can_create_products and admins_can_delete_products
-- exactly (same admin+ rank requirement, same is_workspace_member()
-- check). No schema change, no new table, no other policy touched.
-- ============================================================

create policy "admins_can_update_products"
  on products for update
  using (is_workspace_member(workspace_id, 'admin'));