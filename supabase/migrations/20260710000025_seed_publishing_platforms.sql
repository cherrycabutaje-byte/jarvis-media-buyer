-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 025_seed_publishing_platforms
-- Additive seed data - not a schema change
--
-- Seeds publishing_platforms with the first two platforms confirmed
-- by real evidence: Facebook and Instagram, both matching real
-- ProductType values ("facebook-campaign", "instagram-campaign")
-- and the existing facebookAdExpert brain/facebook-ad page feature.
-- Google Ads is NOT seeded here - "google-ads" being a real
-- ProductType confirms deliverable-generation support, not
-- confirmed external-publication support; it requires its own
-- future, explicit platform-support decision. No other platform
-- (TikTok, YouTube, LinkedIn, X/Twitter, etc.) has any evidence
-- anywhere in this codebase and is not seeded.
--
-- This slice only establishes valid publishing_platforms rows to
-- satisfy publications.platform_id's foreign key for future work.
-- It creates no credentials, no publication rows, and does not mark
-- any asset published - those remain later, separate slices
-- (Publishing Credential Security, Publication Request, Publication
-- Worker Lifecycle, Confirmed publication success).
--
-- STABLE IDENTITY: no existing convention for fixed/deterministic
-- UUID literals was found anywhere in this project (confirmed via
-- direct search - migration 015, the only prior seed migration,
-- uses job_type, a plain enum, as its natural conflict key, not a
-- UUID). The two UUIDs below are UUIDv5 values, deterministically
-- derived from stable name strings (documented per-row below), not
-- random or sequential. The literal UUIDs are stored directly in
-- this migration - no uuid-generation extension or runtime
-- calculation is required to apply it. name remains a human-facing
-- display label only - id is the durable technical identity the
-- future publication workflow must reference.
--
-- CONFLICT HANDLING: does not use a bare ON CONFLICT DO NOTHING,
-- which would silently mask contradictory existing data. Both
-- identity directions are explicitly checked first - expected id
-- paired with a different name, or expected name paired with a
-- different id - either contradiction raises a loud, descriptive
-- exception rather than silently proceeding or overwriting. Once
-- identity is confirmed non-contradictory, the row is inserted if
-- absent, and is_active is explicitly set to true regardless of
-- whether the row was just inserted or already existed - so a
-- legitimate rerun restores a correctly-identified-but-inactive row
-- rather than leaving it inactive.
-- ============================================================

do $$
declare
  -- UUIDv5, derived from the stable name string:
  -- "jarvis-media-buyer:publishing-platform:facebook"
  facebook_id constant uuid := '084b8440-d245-5ded-9bd6-fc9754ce3f52';
  -- UUIDv5, derived from the stable name string:
  -- "jarvis-media-buyer:publishing-platform:instagram"
  instagram_id constant uuid := '5e9b37c6-9732-5420-8031-1c9c54d5246f';
  v_existing_name text;
  v_existing_id uuid;
begin
  -- ---------------- Facebook ----------------
  select name into v_existing_name from public.publishing_platforms where id = facebook_id;
  if v_existing_name is not null and v_existing_name is distinct from 'Facebook' then
    raise exception 'public.publishing_platforms.id % already exists with name % (expected Facebook) - refusing to overwrite', facebook_id, v_existing_name;
  end if;

  select id into v_existing_id from public.publishing_platforms where name = 'Facebook';
  if v_existing_id is not null and v_existing_id is distinct from facebook_id then
    raise exception 'public.publishing_platforms.name ''Facebook'' already exists with id % (expected %) - refusing to overwrite', v_existing_id, facebook_id;
  end if;

  insert into public.publishing_platforms (id, name, is_active)
  values (facebook_id, 'Facebook', true)
  on conflict (id) do nothing;

  update public.publishing_platforms
  set is_active = true
  where id = facebook_id and is_active is distinct from true;

  -- ---------------- Instagram ----------------
  select name into v_existing_name from public.publishing_platforms where id = instagram_id;
  if v_existing_name is not null and v_existing_name is distinct from 'Instagram' then
    raise exception 'public.publishing_platforms.id % already exists with name % (expected Instagram) - refusing to overwrite', instagram_id, v_existing_name;
  end if;

  select id into v_existing_id from public.publishing_platforms where name = 'Instagram';
  if v_existing_id is not null and v_existing_id is distinct from instagram_id then
    raise exception 'public.publishing_platforms.name ''Instagram'' already exists with id % (expected %) - refusing to overwrite', v_existing_id, instagram_id;
  end if;

  insert into public.publishing_platforms (id, name, is_active)
  values (instagram_id, 'Instagram', true)
  on conflict (id) do nothing;

  update public.publishing_platforms
  set is_active = true
  where id = instagram_id and is_active is distinct from true;
end $$;