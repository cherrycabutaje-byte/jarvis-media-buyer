-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 002_identity_authorization
-- Component 2: Identity & Authorization
-- Architecture Version 1.0 - FROZEN
-- ============================================================

create or replace function workspace_role_rank(r workspace_role)
returns int
language sql
immutable
as $$
  select case r
    when 'owner' then 4
    when 'admin' then 3
    when 'member' then 2
    when 'viewer' then 1
  end;
$$;

create or replace function is_workspace_member(
  target_workspace_id uuid,
  min_role workspace_role default 'member'
)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and workspace_role_rank(wm.role) >= workspace_role_rank(min_role)
  );
$$;

alter table workspaces enable row level security;

create policy "members_can_view_workspace"
  on workspaces for select
  using (is_workspace_member(id, 'viewer'));

create policy "owners_can_update_workspace"
  on workspaces for update
  using (is_workspace_member(id, 'owner'));

create policy "owners_can_delete_workspace"
  on workspaces for delete
  using (is_workspace_member(id, 'owner'));

alter table workspace_members enable row level security;

create policy "members_can_view_membership"
  on workspace_members for select
  using (is_workspace_member(workspace_id, 'viewer'));

create policy "admins_can_add_members"
  on workspace_members for insert
  with check (is_workspace_member(workspace_id, 'admin'));

create policy "admins_can_update_members"
  on workspace_members for update
  using (is_workspace_member(workspace_id, 'admin'));

create policy "admins_can_remove_members"
  on workspace_members for delete
  using (is_workspace_member(workspace_id, 'admin'));

create or replace function prevent_admin_owner_modification()
returns trigger
language plpgsql
security definer
as $$
declare
  acting_user_role workspace_role;
begin
  select role into acting_user_role
  from workspace_members
  where workspace_id = coalesce(new.workspace_id, old.workspace_id)
    and user_id = auth.uid();

  if acting_user_role = 'admin' then
    if TG_OP = 'DELETE' and old.role = 'owner' then
      raise exception 'Admins cannot remove an owner from the workspace';
    end if;
    if TG_OP = 'UPDATE' and (old.role = 'owner' or new.role = 'owner') then
      raise exception 'Admins cannot change an owner''s role or grant owner rank';
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_admin_owner_modification
  before update or delete on workspace_members
  for each row
  execute function prevent_admin_owner_modification();

alter table brands enable row level security;

create policy "members_can_view_brands"
  on brands for select
  using (is_workspace_member(workspace_id, 'viewer'));

create policy "admins_can_create_brands"
  on brands for insert
  with check (is_workspace_member(workspace_id, 'admin'));

create policy "admins_can_update_brands"
  on brands for update
  using (is_workspace_member(workspace_id, 'admin'));

create policy "admins_can_delete_brands"
  on brands for delete
  using (is_workspace_member(workspace_id, 'admin'));

alter table brain_runs enable row level security;

create policy "members_can_view_brain_runs"
  on brain_runs for select
  using (
    exists (
      select 1 from brands b
      where b.id = brain_runs.brand_id
        and is_workspace_member(b.workspace_id, 'viewer')
    )
  );

create policy "admins_can_trigger_brain_runs"
  on brain_runs for insert
  with check (
    exists (
      select 1 from brands b
      where b.id = brain_runs.brand_id
        and is_workspace_member(b.workspace_id, 'admin')
    )
  );

create policy "admins_can_invalidate_brain_runs"
  on brain_runs for update
  using (
    exists (
      select 1 from brands b
      where b.id = brain_runs.brand_id
        and is_workspace_member(b.workspace_id, 'admin')
    )
  );

alter table products enable row level security;

create policy "members_can_view_products"
  on products for select
  using (is_workspace_member(workspace_id, 'viewer'));

create policy "admins_can_create_products"
  on products for insert
  with check (is_workspace_member(workspace_id, 'admin'));

create policy "admins_can_delete_products"
  on products for delete
  using (is_workspace_member(workspace_id, 'admin'));

alter table variations enable row level security;

create policy "members_can_view_variations"
  on variations for select
  using (
    exists (
      select 1 from products p
      where p.id = variations.product_id
        and is_workspace_member(p.workspace_id, 'viewer')
    )
  );

create policy "admins_can_create_variations"
  on variations for insert
  with check (
    exists (
      select 1 from products p
      where p.id = variations.product_id
        and is_workspace_member(p.workspace_id, 'admin')
    )
  );

alter table assets enable row level security;

create policy "members_can_view_assets"
  on assets for select
  using (
    exists (
      select 1 from products p
      where p.id = assets.product_id
        and is_workspace_member(p.workspace_id, 'viewer')
    )
  );

create policy "admins_can_create_assets"
  on assets for insert
  with check (
    exists (
      select 1 from products p
      where p.id = assets.product_id
        and is_workspace_member(p.workspace_id, 'admin')
    )
  );

create policy "admins_can_delete_assets"
  on assets for delete
  using (
    exists (
      select 1 from products p
      where p.id = assets.product_id
        and is_workspace_member(p.workspace_id, 'admin')
    )
  );

alter table provider_credentials enable row level security;
alter table publishing_credentials enable row level security;

create type invite_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role workspace_role not null default 'member',
  invited_by uuid not null references profiles(id),
  status invite_status not null default 'pending',
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create unique index idx_invites_pending_email
  on workspace_invites(workspace_id, email)
  where status = 'pending';

alter table workspace_invites enable row level security;

create policy "admins_can_view_invites"
  on workspace_invites for select
  using (is_workspace_member(workspace_id, 'admin'));

create policy "admins_can_create_invites"
  on workspace_invites for insert
  with check (is_workspace_member(workspace_id, 'admin'));

create policy "admins_can_revoke_invites"
  on workspace_invites for update
  using (is_workspace_member(workspace_id, 'admin'));