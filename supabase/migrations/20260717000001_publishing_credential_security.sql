-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260717000001_publishing_credential_security
-- Additive schema change (one nullable-column alteration, one new
-- column) plus three new SECURITY DEFINER functions
--
-- Publishing Credential Security slice. Establishes Vault-backed
-- credential storage with admin-authorized configure/list/revoke
-- lifecycle operations. Does NOT implement decrypted credential
-- retrieval, publication execution, or Worker access - those remain
-- explicitly deferred, blocked on the standing "Authenticated Worker
-- RPC Isolation" backlog item (the database cannot yet distinguish
-- a trusted Worker from any other authenticated user).
--
-- VAULT USAGE: confirmed live, via a temporary, disposable,
-- fully-cleaned-up diagnostic test (not committed) - a
-- SECURITY DEFINER function owned by postgres can safely call
-- vault.create_secret()/vault.update_secret()/read
-- vault.decrypted_secrets, while the authenticated caller itself
-- has zero direct Vault access (confirmed via proacl inspection:
-- only postgres/service_role have EXECUTE on Vault's own functions).
-- No function in this migration ever returns decrypted_secret,
-- secret, or any other secret material - only safe metadata
-- (platform_name, platform_account_id, token_expires_at, created_at)
-- ever crosses back to the client.
--
-- encrypted_credential: per explicit instruction, NOT given a
-- placeholder value. The column is altered to be nullable (it was
-- NOT NULL, but the table is confirmed to have zero rows, so this is
-- a safe, non-destructive change) and is never written to again by
-- any function here. It is left in place, deprecated, pending a
-- separate future decision about its removal - only vault_secret_id
-- is used going forward.
--
-- platform_name remains free text in this slice, per explicit
-- instruction - introducing a platform_id foreign key (correcting
-- the real inconsistency versus publications.platform_id) is
-- deliberately deferred to its own future "Platform normalization"
-- migration, not bundled into this one. configure_publishing_credential
-- validates platform_name against the real publishing_platforms
-- table's name column before any Vault operation - raising
-- 'Unknown publishing platform' for any name that doesn't exist
-- there, so an unsupported name can never reach Vault at all.
--
-- CONCURRENCY - two distinct, coexisting locking mechanisms:
--
-- 1. Workspace-row lock (FOR UPDATE on workspaces): locked and
--    confirmed to exist BEFORE the authorization check, in both
--    configure_publishing_credential and revoke_publishing_credential.
--    This serializes ALL configure/revoke calls against the same
--    workspace against each other (regardless of platform), giving
--    a single, consistent serialization point for workspace-level
--    credential operations, and a stable existence check for the
--    workspace itself.
--
-- 2. Advisory transaction lock (pg_advisory_xact_lock) on a
--    deterministic hash of (workspace_id, platform_name): acquired
--    in configure_publishing_credential only, immediately after
--    auth check and before the workspace-row lock. This closes a
--    specific gap the workspace lock alone cannot solve on its own
--    if it is ever loosened in the future: SELECT ... FOR UPDATE on
--    publishing_credentials only locks a row that already exists -
--    it provides no protection when two concurrent callers are both
--    configuring the exact same (workspace_id, platform_name) pair
--    for the very first time (no row yet exists to lock). The
--    advisory lock is deterministic per pair - different workspaces
--    or different platforms never block each other - and is
--    automatically released at transaction end.
--
-- These two locks solve different problems and both remain: the
-- advisory lock does NOT replace the workspace-row lock.
--
-- EXACT EXECUTION ORDER in configure_publishing_credential:
--   1. auth.uid() is null check
--   2. advisory transaction lock on (workspace_id, platform_name)
--   3. lock and confirm the workspace row exists (FOR UPDATE)
--   4. authorize: is_workspace_member(workspace_id, 'admin')
--   5. validate the secret value is non-blank
--   6. validate platform_name exists in publishing_platforms
--   7. query the existing publishing_credentials row (protected by
--      both locks above)
--   8. create or update the Vault secret
--   9. insert or update publishing_credentials metadata
--
-- revoke_publishing_credential uses the same workspace-row locking
-- discipline (lock and confirm workspace row before authorization),
-- so configure and revoke calls against the same workspace serialize
-- correctly against each other via the shared workspace lock.
--
-- Atomicity: each function is a single PL/pgSQL call, executed as
-- one transaction - the Vault write and the publishing_credentials
-- write (or delete) either both succeed or both roll back together.
--
-- KNOWN, DOCUMENTED, DEFERRED GAP (not solved here, per explicit
-- instruction): workspace deletion cascades to delete
-- publishing_credentials rows (ON DELETE CASCADE, pre-existing,
-- unchanged), but does NOT delete the corresponding vault.secrets
-- row - a workspace deletion could orphan a Vault secret. This is a
-- deferred dependency: "Workspace lifecycle cleanup" - not addressed
-- by this migration.
-- ============================================================

alter table public.publishing_credentials
  alter column encrypted_credential drop not null;

alter table public.publishing_credentials
  add column if not exists vault_secret_id uuid;

create or replace function public.configure_publishing_credential(
  p_workspace_id uuid,
  p_platform_name text,
  p_secret_value text,
  p_platform_account_id text default null,
  p_token_expires_at timestamptz default null
)
returns table(
  id uuid,
  workspace_id uuid,
  platform_name text,
  platform_account_id text,
  token_expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_workspace_exists uuid;
  v_existing_id uuid;
  v_existing_vault_secret_id uuid;
  v_platform_exists boolean;
  v_new_vault_secret_id uuid;
  v_result_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to configure a publishing credential';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_platform_name, 0));

  select w.id into v_workspace_exists
  from public.workspaces w
  where w.id = p_workspace_id
  for update of w;

  if v_workspace_exists is null then
    raise exception 'Workspace % not found', p_workspace_id;
  end if;

  if not is_workspace_member(p_workspace_id, 'admin'::workspace_role) then
    raise exception 'You are not authorized to configure publishing credentials for this workspace';
  end if;

  if p_secret_value is null or trim(p_secret_value) = '' then
    raise exception 'A secret value is required';
  end if;

  select exists(
    select 1 from public.publishing_platforms where name = p_platform_name
  ) into v_platform_exists;

  if not v_platform_exists then
    raise exception 'Unknown publishing platform: %', p_platform_name;
  end if;

  select pc.id, pc.vault_secret_id
  into v_existing_id, v_existing_vault_secret_id
  from public.publishing_credentials pc
  where pc.workspace_id = p_workspace_id and pc.platform_name = p_platform_name
  for update of pc;

  if v_existing_id is not null then
    perform vault.update_secret(
      v_existing_vault_secret_id,
      p_secret_value,
      format('publishing_credential:%s:%s', p_workspace_id, p_platform_name),
      format('JARVIS publishing credential for workspace %s, platform %s', p_workspace_id, p_platform_name)
    );

    update public.publishing_credentials pc
    set platform_account_id = p_platform_account_id,
        token_expires_at = p_token_expires_at
    where pc.id = v_existing_id;

    v_result_id := v_existing_id;
  else
    select vault.create_secret(
      p_secret_value,
      format('publishing_credential:%s:%s', p_workspace_id, p_platform_name),
      format('JARVIS publishing credential for workspace %s, platform %s', p_workspace_id, p_platform_name)
    ) into v_new_vault_secret_id;

    insert into public.publishing_credentials (
      workspace_id, platform_name, vault_secret_id, platform_account_id, token_expires_at
    ) values (
      p_workspace_id, p_platform_name, v_new_vault_secret_id, p_platform_account_id, p_token_expires_at
    )
    returning public.publishing_credentials.id into v_result_id;
  end if;

  return query
    select pc.id, pc.workspace_id, pc.platform_name, pc.platform_account_id, pc.token_expires_at, pc.created_at
    from public.publishing_credentials pc
    where pc.id = v_result_id;
end;
$$;

revoke all on function public.configure_publishing_credential(uuid, text, text, text, timestamptz) from public;
revoke all on function public.configure_publishing_credential(uuid, text, text, text, timestamptz) from anon;
revoke all on function public.configure_publishing_credential(uuid, text, text, text, timestamptz) from service_role;
grant execute on function public.configure_publishing_credential(uuid, text, text, text, timestamptz) to authenticated;

create or replace function public.list_publishing_credentials(
  p_workspace_id uuid
)
returns table(
  id uuid,
  workspace_id uuid,
  platform_name text,
  platform_account_id text,
  token_expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to list publishing credentials';
  end if;

  if not is_workspace_member(p_workspace_id, 'admin'::workspace_role) then
    raise exception 'You are not authorized to view publishing credentials for this workspace';
  end if;

  return query
    select pc.id, pc.workspace_id, pc.platform_name, pc.platform_account_id, pc.token_expires_at, pc.created_at
    from public.publishing_credentials pc
    where pc.workspace_id = p_workspace_id
    order by pc.platform_name;
end;
$$;

revoke all on function public.list_publishing_credentials(uuid) from public;
revoke all on function public.list_publishing_credentials(uuid) from anon;
revoke all on function public.list_publishing_credentials(uuid) from service_role;
grant execute on function public.list_publishing_credentials(uuid) to authenticated;

create or replace function public.revoke_publishing_credential(
  p_workspace_id uuid,
  p_platform_name text
)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_workspace_exists uuid;
  v_existing_id uuid;
  v_existing_vault_secret_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to revoke a publishing credential';
  end if;

  select w.id into v_workspace_exists
  from public.workspaces w
  where w.id = p_workspace_id
  for update of w;

  if v_workspace_exists is null then
    raise exception 'Workspace % not found', p_workspace_id;
  end if;

  if not is_workspace_member(p_workspace_id, 'admin'::workspace_role) then
    raise exception 'You are not authorized to revoke publishing credentials for this workspace';
  end if;

  select pc.id, pc.vault_secret_id
  into v_existing_id, v_existing_vault_secret_id
  from public.publishing_credentials pc
  where pc.workspace_id = p_workspace_id and pc.platform_name = p_platform_name
  for update of pc;

  if v_existing_id is null then
    raise exception 'No publishing credential found for workspace % and platform %', p_workspace_id, p_platform_name;
  end if;

  delete from public.publishing_credentials pc where pc.id = v_existing_id;
  delete from vault.secrets vs where vs.id = v_existing_vault_secret_id;

  return true;
end;
$$;

revoke all on function public.revoke_publishing_credential(uuid, text) from public;
revoke all on function public.revoke_publishing_credential(uuid, text) from anon;
revoke all on function public.revoke_publishing_credential(uuid, text) from service_role;
grant execute on function public.revoke_publishing_credential(uuid, text) to authenticated;