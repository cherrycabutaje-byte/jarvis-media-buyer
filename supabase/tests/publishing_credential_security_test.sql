-- ============================================================
-- Publishing Credential Security - REAL LOCAL VAULT TEST HARNESS
-- (CORRECTED - harness-only fixes, migration untouched)
-- ============================================================

drop table if exists pg_temp.test_results;
create temp table test_results (
  test_name text primary key,
  passed boolean not null,
  detail text
);

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise exception 'supabase_vault extension not found - this test requires the real local Supabase Vault';
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    raise exception 'vault schema not found - this test requires the real local Supabase Vault';
  end if;
  raise notice 'Confirmed: real supabase_vault extension and vault schema present.';
end $$;

do $$
declare
  v_admin_id uuid := 'f1000000-0000-0000-0000-000000000001';
  v_member_id uuid := 'f1000000-0000-0000-0000-000000000002';
  v_nonmember_id uuid := 'f1000000-0000-0000-0000-000000000003';
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
begin
  delete from public.publishing_credentials where workspace_id = v_workspace_id;
  delete from public.workspace_members where workspace_id = v_workspace_id;
  delete from public.workspaces where id = v_workspace_id;
  delete from auth.users where id in (v_admin_id, v_member_id, v_nonmember_id);

  insert into auth.users (id, email) values
    (v_admin_id, 'test-credsec-admin@example.invalid'),
    (v_member_id, 'test-credsec-member@example.invalid'),
    (v_nonmember_id, 'test-credsec-nonmember@example.invalid');

  insert into public.workspaces (id, name, owner_id) values
    (v_workspace_id, 'Credential Security Test Workspace', v_admin_id);

  insert into public.workspace_members (workspace_id, user_id, role) values
    (v_workspace_id, v_admin_id, 'owner'),
    (v_workspace_id, v_member_id, 'member');

  raise notice 'Fixtures created: admin=%, member=%, nonmember=%, workspace=%',
    v_admin_id, v_member_id, v_nonmember_id, v_workspace_id;
end $$;

do $$
declare
  v_acl text;
begin
  begin
    select proacl::text into v_acl from pg_proc where proname = 'configure_publishing_credential';
    if v_acl like '%anon=%' then
      raise exception 'anon has an unexpected grant: %', v_acl;
    end if;
    if v_acl like '%service_role=%' then
      raise exception 'service_role has an unexpected grant: %', v_acl;
    end if;
    if v_acl not like '%authenticated=X%' then
      raise exception 'authenticated is missing EXECUTE: %', v_acl;
    end if;
    insert into test_results values ('1a_configure_acl', true, v_acl);
  exception when others then
    insert into test_results values ('1a_configure_acl', false, sqlerrm);
  end;
end $$;

do $$
declare
  v_acl text;
begin
  begin
    select proacl::text into v_acl from pg_proc where proname = 'list_publishing_credentials';
    if v_acl like '%anon=%' or v_acl like '%service_role=%' then
      raise exception 'unexpected grant: %', v_acl;
    end if;
    insert into test_results values ('1b_list_acl', true, v_acl);
  exception when others then
    insert into test_results values ('1b_list_acl', false, sqlerrm);
  end;
end $$;

do $$
declare
  v_acl text;
begin
  begin
    select proacl::text into v_acl from pg_proc where proname = 'revoke_publishing_credential';
    if v_acl like '%anon=%' or v_acl like '%service_role=%' then
      raise exception 'unexpected grant: %', v_acl;
    end if;
    insert into test_results values ('1c_revoke_acl', true, v_acl);
  exception when others then
    insert into test_results values ('1c_revoke_acl', false, sqlerrm);
  end;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_admin_id uuid := 'f1000000-0000-0000-0000-000000000001';
  v_row record;
  v_vault_count int;
  v_vault_secret_value text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text)::text, true);
    perform set_config('role', 'authenticated', true);

    select * into v_row from public.configure_publishing_credential(
      v_workspace_id, 'Facebook', 'REAL-VAULT-TEST-SECRET-V1', 'fb-acct-1', now() + interval '30 days'
    );

    reset role;
    perform set_config('request.jwt.claims', '', true);

    if v_row.id is null then
      raise exception 'configure_publishing_credential returned no row';
    end if;
    if v_row.platform_account_id is distinct from 'fb-acct-1' then
      raise exception 'unexpected platform_account_id: %', v_row.platform_account_id;
    end if;

    select count(*) into v_vault_count from vault.secrets;
    if v_vault_count <> 1 then
      raise exception 'expected exactly 1 real vault.secrets row, found %', v_vault_count;
    end if;

    select decrypted_secret into v_vault_secret_value from vault.decrypted_secrets limit 1;
    if v_vault_secret_value is distinct from 'REAL-VAULT-TEST-SECRET-V1' then
      raise exception 'real Vault secret value mismatch: %', v_vault_secret_value;
    end if;

    insert into test_results values ('2_configure_create', true, format('credential id=%s, vault value confirmed', v_row.id));
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into test_results values ('2_configure_create', false, sqlerrm);
  end;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_admin_id uuid := 'f1000000-0000-0000-0000-000000000001';
  v_row_before record;
  v_row_after record;
  v_vault_count int;
  v_vault_secret_value text;
begin
  begin
    select id, platform_account_id into v_row_before from public.publishing_credentials
      where workspace_id = v_workspace_id and platform_name = 'Facebook';

    perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text)::text, true);
    perform set_config('role', 'authenticated', true);

    select * into v_row_after from public.configure_publishing_credential(
      v_workspace_id, 'Facebook', 'REAL-VAULT-TEST-SECRET-V2-ROTATED', 'fb-acct-2', now() + interval '60 days'
    );

    reset role;
    perform set_config('request.jwt.claims', '', true);

    if v_row_before.id is null then
      raise exception 'precondition failed: no existing Facebook credential found before replace (Test 2 must have succeeded first)';
    end if;
    if v_row_after.id is distinct from v_row_before.id then
      raise exception 'credential row id changed on replace (before=%, after=%)', v_row_before.id, v_row_after.id;
    end if;
    if v_row_after.platform_account_id is distinct from 'fb-acct-2' then
      raise exception 'platform_account_id not updated: %', v_row_after.platform_account_id;
    end if;

    select count(*) into v_vault_count from vault.secrets;
    if v_vault_count <> 1 then
      raise exception 'expected exactly 1 real vault.secrets row after replace, found %', v_vault_count;
    end if;

    select decrypted_secret into v_vault_secret_value from vault.decrypted_secrets limit 1;
    if v_vault_secret_value is distinct from 'REAL-VAULT-TEST-SECRET-V2-ROTATED' then
      raise exception 'real Vault secret was not updated in place: %', v_vault_secret_value;
    end if;

    insert into test_results values ('3_configure_replace', true, 'same row id, same vault_secret_id, value rotated');
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into test_results values ('3_configure_replace', false, sqlerrm);
  end;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_admin_id uuid := 'f1000000-0000-0000-0000-000000000001';
  v_count int;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text)::text, true);
    perform set_config('role', 'authenticated', true);

    select count(*) into v_count from public.list_publishing_credentials(v_workspace_id);

    reset role;
    perform set_config('request.jwt.claims', '', true);

    if v_count <> 1 then
      raise exception 'expected exactly 1 listed credential, found %', v_count;
    end if;

    insert into test_results values ('4_list_metadata', true, 'exactly 1 row returned');
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into test_results values ('4_list_metadata', false, sqlerrm);
  end;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_member_id uuid := 'f1000000-0000-0000-0000-000000000002';
  v_denied boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_member_id::text)::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.configure_publishing_credential(v_workspace_id, 'Instagram', 'should-not-be-created', null, null);
  exception when others then
    v_denied := true;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_denied then
    insert into test_results values ('5_nonadmin_denied', true, 'correctly denied');
  else
    insert into test_results values ('5_nonadmin_denied', false, 'non-admin member was able to configure a credential');
  end if;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_nonmember_id uuid := 'f1000000-0000-0000-0000-000000000003';
  v_denied boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_nonmember_id::text)::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.configure_publishing_credential(v_workspace_id, 'Instagram', 'should-not-be-created', null, null);
  exception when others then
    v_denied := true;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_denied then
    insert into test_results values ('6_nonmember_denied', true, 'correctly denied');
  else
    insert into test_results values ('6_nonmember_denied', false, 'non-member was able to configure a credential');
  end if;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_denied boolean := false;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);

  begin
    perform public.configure_publishing_credential(v_workspace_id, 'Instagram', 'should-not-be-created', null, null);
  exception when others then
    v_denied := true;
  end;

  reset role;

  if v_denied then
    insert into test_results values ('7_anon_denied', true, 'correctly denied');
  else
    insert into test_results values ('7_anon_denied', false, 'anon was able to configure a credential');
  end if;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_denied boolean := false;
begin
  perform set_config('role', 'service_role', true);

  begin
    perform public.configure_publishing_credential(v_workspace_id, 'Instagram', 'should-not-be-created', null, null);
  exception when others then
    v_denied := true;
  end;

  reset role;

  if v_denied then
    insert into test_results values ('8_service_role_denied', true, 'correctly denied');
  else
    insert into test_results values ('8_service_role_denied', false, 'service_role was able to call configure_publishing_credential despite no EXECUTE grant');
  end if;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_admin_id uuid := 'f1000000-0000-0000-0000-000000000001';
  v_vault_count_before int;
  v_vault_count_after int;
  v_denied boolean := false;
begin
  select count(*) into v_vault_count_before from vault.secrets;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text)::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.configure_publishing_credential(v_workspace_id, 'TikTok', 'irrelevant-value', null, null);
  exception when others then
    v_denied := true;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_vault_count_after from vault.secrets;

  if v_denied and v_vault_count_after = v_vault_count_before then
    insert into test_results values ('9_unknown_platform', true, 'rejected before Vault interaction, vault count unchanged');
  elsif not v_denied then
    insert into test_results values ('9_unknown_platform', false, 'unsupported platform name was NOT rejected');
  else
    insert into test_results values ('9_unknown_platform', false, format('a real Vault secret was created despite the unknown platform (before=%s, after=%s)', v_vault_count_before, v_vault_count_after));
  end if;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_admin_id uuid := 'f1000000-0000-0000-0000-000000000001';
  v_vault_count_before int;
  v_vault_count_after int;
begin
  select count(*) into v_vault_count_before from vault.secrets;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text)::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.configure_publishing_credential(v_workspace_id, 'Instagram', 'should-be-rolled-back', null, null);
    raise exception 'Deliberate forced failure to test rollback';
  exception when others then
    null;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_vault_count_after from vault.secrets;

  if v_vault_count_after = v_vault_count_before
     and not exists (select 1 from public.publishing_credentials where workspace_id = v_workspace_id and platform_name = 'Instagram')
  then
    insert into test_results values ('10_forced_rollback', true, 'real Vault write and credentials write both rolled back, no orphan');
  else
    insert into test_results values ('10_forced_rollback', false, format('rollback incomplete: vault before=%s after=%s', v_vault_count_before, v_vault_count_after));
  end if;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_admin_id uuid := 'f1000000-0000-0000-0000-000000000001';
  v_result boolean;
  v_credential_count int;
  v_vault_count int;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text)::text, true);
    perform set_config('role', 'authenticated', true);

    select public.revoke_publishing_credential(v_workspace_id, 'Facebook') into v_result;

    reset role;
    perform set_config('request.jwt.claims', '', true);

    if v_result is distinct from true then
      raise exception 'revoke_publishing_credential did not return true';
    end if;

    select count(*) into v_credential_count from public.publishing_credentials where workspace_id = v_workspace_id;
    select count(*) into v_vault_count from vault.secrets;

    if v_credential_count <> 0 then
      raise exception 'publishing_credentials row still exists after revoke, count=%', v_credential_count;
    end if;
    if v_vault_count <> 0 then
      raise exception 'real Vault secret still exists after revoke, count=%', v_vault_count;
    end if;

    insert into test_results values ('11_revoke', true, 'credential row and real Vault secret both removed');
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into test_results values ('11_revoke', false, sqlerrm);
  end;
end $$;

do $$
declare
  v_workspace_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_admin_id uuid := 'f1000000-0000-0000-0000-000000000001';
  v_member_id uuid := 'f1000000-0000-0000-0000-000000000002';
  v_nonmember_id uuid := 'f1000000-0000-0000-0000-000000000003';
begin
  delete from public.publishing_credentials where workspace_id = v_workspace_id;
  delete from vault.secrets vs where vs.name like format('publishing_credential:%s:%%', v_workspace_id);
  delete from public.workspace_members where workspace_id = v_workspace_id;
  delete from public.workspaces where id = v_workspace_id;
  delete from auth.users where id in (v_admin_id, v_member_id, v_nonmember_id);
  raise notice 'Cleanup complete - all fixtures removed.';
end $$;

select test_name, passed, detail from test_results order by test_name;

do $$
declare
  v_fail_count int;
  v_total_count int;
begin
  select count(*) filter (where not passed), count(*) into v_fail_count, v_total_count from test_results;

  if v_fail_count > 0 then
    raise exception 'FAIL: % of % tests failed - see results table above for details', v_fail_count, v_total_count;
  else
    raise notice '=== PASS: all % tests passed ===', v_total_count;
  end if;
end $$;