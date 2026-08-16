-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260817000001_publication_worker_asset_platform_reads
-- Additive - two new SECURITY DEFINER functions, service_role only.
-- No schema/table/trigger/index modification. No change to any
-- frozen object.
--
-- Real Meta Publishing Provider slice - defect fix. During local
-- testing, the Worker's plain .from('assets')/.from('publishing_
-- platforms').select(...) reads via createWorkerClient() failed
-- with "permission denied" - confirmed directly: service_role has
-- no SELECT grant on either table (only TRIGGER/REFERENCES/
-- TRUNCATE), so RLS bypass alone (which only applies once a
-- baseline table privilege already exists) was insufficient. This
-- was a genuine defect in this slice's own new code, not a
-- pre-existing frozen-architecture conflict.
--
-- Fixed using this project's already-established, consistent
-- pattern (matching get_publication_credential exactly): narrow,
-- single-purpose SECURITY DEFINER functions rather than a raw
-- table-level GRANT SELECT to service_role, which would have
-- over-exposed every row of both tables rather than only the
-- specific row a legitimately claimed publication actually needs.
-- ============================================================

create or replace function public.get_asset_text_for_publication(
  p_asset_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_payload jsonb;
  v_raw_text text;
begin
  select asset_payload into v_asset_payload
  from assets
  where id = p_asset_id;

  if v_asset_payload is null then
    raise exception 'Asset % not found', p_asset_id;
  end if;

  v_raw_text := v_asset_payload ->> 'rawText';

  if v_raw_text is null or trim(v_raw_text) = '' then
    raise exception 'Asset % has no valid publishable text (asset_payload.rawText is missing or empty)', p_asset_id;
  end if;

  return v_raw_text;
end;
$$;

revoke all on function public.get_asset_text_for_publication(uuid) from public;
revoke all on function public.get_asset_text_for_publication(uuid) from anon;
revoke all on function public.get_asset_text_for_publication(uuid) from authenticated;
grant execute on function public.get_asset_text_for_publication(uuid) to service_role;

create or replace function public.get_publishing_platform_name(
  p_platform_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name
  from publishing_platforms
  where id = p_platform_id;

  if v_name is null then
    raise exception 'Publishing platform % not found', p_platform_id;
  end if;

  return v_name;
end;
$$;

revoke all on function public.get_publishing_platform_name(uuid) from public;
revoke all on function public.get_publishing_platform_name(uuid) from anon;
revoke all on function public.get_publishing_platform_name(uuid) from authenticated;
grant execute on function public.get_publishing_platform_name(uuid) to service_role;