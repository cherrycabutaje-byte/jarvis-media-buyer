-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 013_workspace_bootstrap_function
-- Additive fix - Database Version 1.0 defect correction
-- ============================================================

create or replace function create_workspace_with_owner(p_name text)
returns workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_workspace workspaces;
begin
  v_owner_id := auth.uid();

  if v_owner_id is null then
    raise exception 'You must be logged in to create a workspace.';
  end if;

  if trim(p_name) = '' then
    raise exception 'Workspace name is required.';
  end if;

  insert into workspaces (name, owner_id)
  values (trim(p_name), v_owner_id)
  returning * into v_workspace;

  insert into workspace_members (workspace_id, user_id, role)
  values (v_workspace.id, v_owner_id, 'owner');

  return v_workspace;
end;
$$;

revoke all on function create_workspace_with_owner(text) from public;
grant execute on function create_workspace_with_owner(text) to authenticated;