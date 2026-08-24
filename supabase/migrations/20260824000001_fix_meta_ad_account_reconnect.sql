-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260824000001_fix_meta_ad_account_reconnect
-- Additive only - replaces two function bodies via CREATE OR
-- REPLACE - does not rewrite any deployed migration history, does
-- not touch any table/RLS policy.
--
-- DEFECT FIXED: connect_meta_ad_account() always called
-- vault.create_secret() unconditionally, using a deterministic name
-- ('meta_ad_account_' || brand_id). Since the underlying Vault
-- secret was never deleted/rotated on disconnect, any reconnect
-- attempt for the same brand collided with the still-existing
-- secret's name, raising "duplicate key value violates unique
-- constraint secrets_name_idx" - reproduced live twice before this
-- fix.
--
-- FIX: check for an existing vault_secret_id on the brand's link
-- row first. If one exists, ROTATE it in place via
-- vault.update_secret() (never a second create_secret() call for
-- the same brand). Only a genuinely first-time connection creates a
-- new secret.
--
-- FAILURE SAFETY: if vault.update_secret() raises, this function's
-- own execution aborts immediately, and since the entire function
-- runs in the RPC's implicit transaction, the meta_ad_account_links
-- row is never touched - it remains exactly as it was (old status,
-- old vault_secret_id intact). This is the smallest safe
-- transactional approach: natural Postgres rollback semantics
-- provide the safety property for free, without extra exception-
-- handling code that could itself introduce a bug.
--
-- DISCONNECTED CREDENTIALS ARE NOW LOGICALLY UNUSABLE:
-- get_meta_ad_account_credential() now checks status = 'connected'
-- before returning anything.
-- ============================================================

create or replace function connect_meta_ad_account(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_meta_ad_account_id text,
  p_meta_business_id text,
  p_access_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_secret_id uuid;
  v_secret_id uuid;
  v_link_id uuid;
begin
  if not is_workspace_member(p_workspace_id, 'admin'::workspace_role) then
    raise exception 'Not authorized to connect a Meta ad account for this workspace';
  end if;

  select vault_secret_id into v_existing_secret_id
  from meta_ad_account_links
  where brand_id = p_brand_id
  for update;

  if v_existing_secret_id is not null then
    perform vault.update_secret(
      v_existing_secret_id,
      p_access_token,
      'meta_ad_account_' || p_brand_id,
      format('JARVIS Meta ad account credential for brand %s', p_brand_id)
    );
    v_secret_id := v_existing_secret_id;
  else
    v_secret_id := vault.create_secret(
      p_access_token,
      'meta_ad_account_' || p_brand_id,
      format('JARVIS Meta ad account credential for brand %s', p_brand_id)
    );
  end if;

  insert into meta_ad_account_links (
    workspace_id, brand_id, meta_ad_account_id, meta_business_id,
    vault_secret_id, status, connected_by, connected_at
  )
  values (
    p_workspace_id, p_brand_id, p_meta_ad_account_id, p_meta_business_id,
    v_secret_id, 'connected', auth.uid(), now()
  )
  on conflict (brand_id) do update set
    meta_ad_account_id = excluded.meta_ad_account_id,
    meta_business_id = excluded.meta_business_id,
    vault_secret_id = v_secret_id,
    status = 'connected',
    connected_by = auth.uid(),
    connected_at = now(),
    last_sync_error = null,
    updated_at = now()
  returning id into v_link_id;

  return v_link_id;
end;
$$;

create or replace function get_meta_ad_account_credential(p_link_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_secret_id uuid;
  v_status text;
  v_secret_value text;
begin
  select workspace_id, vault_secret_id, status into v_workspace_id, v_secret_id, v_status
  from meta_ad_account_links where id = p_link_id;

  if v_workspace_id is null then
    raise exception 'Meta ad account link not found';
  end if;

  if not is_workspace_member(v_workspace_id, 'admin'::workspace_role) then
    raise exception 'Not authorized to access this credential';
  end if;

  if v_status <> 'connected' then
    raise exception 'This Meta ad account connection is not active';
  end if;

  select decrypted_secret into v_secret_value
  from vault.decrypted_secrets where id = v_secret_id;

  return v_secret_value;
end;
$$;
