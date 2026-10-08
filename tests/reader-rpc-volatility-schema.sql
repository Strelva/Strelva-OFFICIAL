\set ON_ERROR_STOP on
\o /dev/null
-- Closest local equivalent to PostgREST POST: look up pg_proc.provolatile,
-- BEGIN READ ONLY for STABLE/IMMUTABLE, READ WRITE for VOLATILE, READ COMMITTED,
-- SET LOCAL ROLE service_role, execute the real RPC, then roll back the request.
-- https://postgrest.org/en/stable/references/transactions.html
-- Run only on the disposable clusters from the two workspace SQL checks.

create function pg_temp.rpc_assert(condition boolean, message text) returns void
language plpgsql as $$
begin
  if condition is not true then raise exception 'reader RPC assertion failed: %', message; end if;
end;
$$;

create function pg_temp.rpc_expect(statement text, expected_state text, expected_message text default null)
returns void language plpgsql as $$
declare result boolean;
begin
  begin
    execute statement into result;
  exception when others then
    if sqlstate is distinct from expected_state then raise; end if;
    if expected_message is not null and sqlerrm <> expected_message then raise; end if;
    raise notice 'Expected %: %', sqlstate, statement;
    return;
  end;
  if expected_state is not null then raise exception 'Expected SQLSTATE %: %', expected_state, statement; end if;
  perform pg_temp.rpc_assert(result, statement);
  raise notice 'Callable as % (read_only=%): %', current_user, current_setting('transaction_read_only'), statement;
end;
$$;

-- Own fictional identities: the authorized caller is both an operator and
-- business owner; the outsider is verified but has neither authority.
insert into public.users(id, email, verified_at) values
  ('25200000-0000-4000-8000-000000000001', 'reader-owner@example.test', now()),
  ('25200000-0000-4000-8000-000000000002', 'reader-outsider@example.test', now());
insert into public.super_admins(user_id, email)
  values ('25200000-0000-4000-8000-000000000001', 'reader-owner@example.test');
insert into public.workspaces(id, kind, name, created_by)
  values ('25200000-0000-4000-8000-000000000010', 'customer', 'Reader RPC fixture', '25200000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values ('25200000-0000-4000-8000-000000000010', '25200000-0000-4000-8000-000000000001', 'owner', '25200000-0000-4000-8000-000000000001');
select id as website_work_id from public.claim_website_rebuild(
  '25200000-0000-4000-8000-000000000010', '25200000-0000-4000-8000-000000000001', 'reader-owner@example.test',
  'reader-rpc-252', 'reader-rpc.example.test', '{}',
  '{"version":2,"revision":0,"title":"Reader RPC website","status":"building","createdBy":"25200000-0000-4000-8000-000000000001","history":[]}'
) \gset

create temporary table rpc_cases(signature text, statement text, denial text);
insert into rpc_cases values
  ('public.read_operator_queue_context(uuid,text)',
   $$select jsonb_typeof(public.read_operator_queue_context('@actor', '@email')) = 'object'$$, 'operator_queue_access_denied'),
  ('public.read_outside_write_receipts(uuid,text,text,uuid,integer)',
   $$select jsonb_typeof(public.read_outside_write_receipts('@actor', '@email', null, '@workspace', 10)) = 'array'$$, 'operator_queue_access_denied'),
  ('public.read_google_listing_readback_failures(uuid,text,integer)',
   $$select jsonb_typeof(public.read_google_listing_readback_failures('@actor', '@email', 10)) = 'array'$$, 'operator_queue_access_denied'),
  ('public.read_business_effort(uuid,text,date,uuid)',
   $$select jsonb_typeof(public.read_business_effort('@actor', '@email', '2026-01-01', '@workspace')) = 'array'$$, 'business_effort_access_denied'),
  ('public.read_effort_businesses(uuid,text)',
   $$select public.read_effort_businesses('@actor', '@email') @> '[{"id":"@workspace"}]'::jsonb$$, 'business_effort_access_denied'),
  ('public.read_make_real_activation(uuid,uuid,text,text)',
   $$select public.read_make_real_activation('@workspace', '@actor', '@email', 'missing-activation') is null$$, 'make_real_activation_access_denied'),
  ('public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer)',
   $$select public.export_workspace_v3_category('@workspace', '@actor', '@email', 'business_record', 0, 10)->>'category' = 'business_record'$$, 'workspace_export_denied'),
  ('public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer)',
   $$select public.export_workspace_v3_category('@workspace', '@actor', '@email', 'systems', 0, 10)->>'category' = 'systems'$$, 'workspace_export_denied'),
  ('public.read_website_current_tenant(uuid,uuid,uuid,text)',
   $$select count(*) = 0 from public.read_website_current_tenant('@workspace', '@work', '@actor', '@email')$$, 'workspace_access_denied'),
  ('public.read_website_linked_publications(uuid,uuid,uuid,text)',
   $$select count(*) = 0 from public.read_website_linked_publications('@workspace', '@work', '@actor', '@email')$$, 'workspace_access_denied'),
  ('public.read_website_domain_approvals(uuid,uuid,uuid,text)',
   $$select count(*) = 0 from public.read_website_domain_approvals('@workspace', '@work', '@actor', '@email')$$, 'workspace_access_denied');
update rpc_cases set statement = replace(replace(replace(replace(statement,
  '@actor', '25200000-0000-4000-8000-000000000001'), '@email', 'reader-owner@example.test'),
  '@workspace', '25200000-0000-4000-8000-000000000010'), '@work', :'website_work_id');
select pg_temp.rpc_assert((select count(distinct signature) from rpc_cases) = 10, 'all ten signatures covered');

-- Snapshot every public function: bodies, ACLs, security, search paths and
-- unrelated volatility must survive rollback/reapply byte-for-byte.
create temporary table rpc_before as
  select p.oid, to_jsonb(p) as definition from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
select pg_temp.rpc_assert(p.provolatile = 'v', c.signature || ' is VOLATILE')
  from rpc_cases c join pg_proc p on p.oid = c.signature::regprocedure;
select pg_temp.rpc_assert(has_function_privilege('service_role', signature, 'execute')
  and not has_function_privilege('anon', signature, 'execute')
  and not has_function_privilege('authenticated', signature, 'execute'), signature || ' stays service-role only')
  from rpc_cases;

-- Rehearse the rollback and prove the real defect on each affected path.
\ir ../supabase/migrations/rollback-20261009150000_reader_rpc_volatility.sql
select pg_temp.rpc_assert(p.provolatile = 's', c.signature || ' rolled back to STABLE')
  from rpc_cases c join pg_proc p on p.oid = c.signature::regprocedure;
select pg_temp.rpc_assert(to_jsonb(p) - 'provolatile' = b.definition - 'provolatile'
  and (to_jsonb(p) = b.definition or exists(select 1 from rpc_cases c where c.signature::regprocedure = p.oid)),
  p.oid::regprocedure::text || ' only targeted volatility changed')
  from rpc_before b join pg_proc p using (oid);
-- After w6 business portability (20261010165500) the export RPC is a VOLATILE
-- wrapper whose own categories take no reader locks, so the old defect cannot
-- replay through it; its volatility and reapply contract still apply.
select format('begin isolation level read committed %s; set local role service_role; select pg_temp.rpc_expect(%L, %L); rollback;',
  case when p.provolatile = 'v' then 'read write' else 'read only' end, c.statement, '25006')
  from rpc_cases c join pg_proc p on p.oid = c.signature::regprocedure
  where not (c.signature like 'public.export_workspace_v3_category(%'
    and to_regprocedure('public.export_workspace_v3_category_before_w6(uuid,uuid,text,text,integer,integer)') is not null)
\gexec

-- Reapply the follow-up: each POST-equivalent request must run successfully.
\ir ../supabase/migrations/20261009150000_reader_rpc_volatility.sql
select format('begin isolation level read committed %s; set local role service_role; select pg_temp.rpc_expect(%L, null); rollback;',
  case when p.provolatile = 'v' then 'read write' else 'read only' end, c.statement)
  from rpc_cases c join pg_proc p on p.oid = c.signature::regprocedure
\gexec

-- Verified outsiders still fail the original authorization check.
select format('begin isolation level read committed %s; set local role service_role; select pg_temp.rpc_expect(%L, %L, %L); rollback;',
  case when p.provolatile = 'v' then 'read write' else 'read only' end,
  replace(replace(c.statement, '25200000-0000-4000-8000-000000000001', '25200000-0000-4000-8000-000000000002'),
    'reader-owner@example.test', 'reader-outsider@example.test'), 'P0001', c.denial)
  from rpc_cases c join pg_proc p on p.oid = c.signature::regprocedure
\gexec

-- Actual read-only paths keep STABLE, including the export authorization helper.
select pg_temp.rpc_assert(provolatile = 's', oid::regprocedure::text || ' stays STABLE') from pg_proc
  where oid in ('public.read_google_listing_receipt(uuid,uuid)'::regprocedure,
    'public.workspace_export_v3_role(uuid,uuid,text)'::regprocedure,
    'public.workspace_export_v3_tenant_rows(text,uuid,text,integer,integer)'::regprocedure);
begin read only;
set local role service_role;
select pg_temp.rpc_expect($$select public.read_google_listing_receipt('25200000-0000-4000-8000-000000000099', '25200000-0000-4000-8000-000000000010') is null$$, null);
rollback;

-- Retry is harmless and does not broaden the change beyond the ten functions.
\ir ../supabase/migrations/20261009150000_reader_rpc_volatility.sql
select pg_temp.rpc_assert(to_jsonb(p) = b.definition, p.oid::regprocedure::text || ' metadata preserved')
  from rpc_before b join pg_proc p using (oid);
\o
\echo Reader RPC regression passed: 10 signatures, 11 locking paths, rollback/reapply, denial and STABLE control.
