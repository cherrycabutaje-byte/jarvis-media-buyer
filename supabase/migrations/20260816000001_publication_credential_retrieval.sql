-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260816000001_publication_credential_retrieval
-- Additive - one new SECURITY DEFINER function, service_role only.
-- No schema/table/trigger/index modification. No change to any
-- frozen object from Publishing Credential Security, Publication
-- Request Creation, or Publication Worker Lifecycle.
--
-- Secure Publishing Credential Retrieval slice. This is the only
-- function in the entire schema ever permitted to return a
-- decrypted credential value. It closes the gap explicitly deferred
-- since the Publishing Credential Security slice: the Worker
-- (service_role) previously had no path to read a decrypted
-- credential at all - not even service_role had SELECT on
-- publishing_credentials (confirmed: only postgres does), and
-- vault.decrypted_secrets is similarly postgres-only. This function
-- runs SECURITY DEFINER as postgres, bridging that gap safely,
-- exactly as configure_publishing_credential/list_publishing_credentials/
-- revoke_publishing_credential already do for the human-facing side.
--
-- KNOWN, PRE-EXISTING, NOT-FIXED-HERE GAP: publishing_credentials.
-- platform_name is free text, not FK'd to publishing_platforms.id
-- (a deliberately deferred decision from the Credential Security
-- slice). This function bridges publications.platform_id (a real
-- FK) to publishing_credentials via publishing_platforms.name as
-- the join key - this is a read-only join, not a schema change, and
-- does not attempt to fix the underlying free-text gap.
--
-- Returns ONLY: decrypted_secret, platform_account_id,
-- token_expires_at. Never returns vault_secret_id or
-- encrypted_credential. This is the sole function in the codebase
-- with this capability, and it is service_role-only - unreachable
-- by any authenticated human session or anon caller.
-- ============================================================

create or replace function public.get_publication_credential(
  p_publication_id uuid
)
returns table(
  decrypted_secret text,
  platform_account_id text,
  token_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_workspace_id uuid;
  v_platform_name text;
  v_vault_secret_id uuid;
begin
  select p.workspace_id, pp.name
  into v_workspace_id, v_platform_name
  from publications p
  join publishing_platforms pp on pp.id = p.platform_id
  where p.id = p_publication_id;

  if v_workspace_id is null then
    raise exception 'Publication % not found', p_publication_id;
  end if;

  select pc.vault_secret_id
  into v_vault_secret_id
  from publishing_credentials pc
  where pc.workspace_id = v_workspace_id
    and pc.platform_name = v_platform_name;

  if v_vault_secret_id is null then
    raise exception 'No publishing credential configured for workspace % and platform %', v_workspace_id, v_platform_name;
  end if;

  return query
    select vs.decrypted_secret, pc.platform_account_id, pc.token_expires_at
    from vault.decrypted_secrets vs
    join publishing_credentials pc on pc.vault_secret_id = vs.id
    where vs.id = v_vault_secret_id;
end;
$$;

revoke all on function public.get_publication_credential(uuid) from public;
revoke all on function public.get_publication_credential(uuid) from anon;
revoke all on function public.get_publication_credential(uuid) from authenticated;
grant execute on function public.get_publication_credential(uuid) to service_role;