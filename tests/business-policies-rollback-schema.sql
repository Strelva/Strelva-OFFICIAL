\set ON_ERROR_STOP on
-- Real rollback rehearsal: first with a current policy, then with only history.
\if :check_history
  do $$ begin
    if to_regclass('public.business_policies') is null
      or not public.business_record_fact_valid('response_time','{"maximumHours":24}')
      or exists(select 1 from public.business_record_facts where workspace_id='bf305010-0000-4000-8000-000000000010')
      or (select count(*) from public.business_record_revisions where workspace_id='bf305010-0000-4000-8000-000000000010') <> 2 then
      raise exception 'policy rollback did not preserve history/schema';
    end if;
  end $$;
\else
  \if :undo_terms
    do $$ begin
      if not exists(select 1 from public.business_policies where workspace_id='bf305010-0000-4000-8000-000000000010'
        and policy_key='cancellation' and verified and value->>'summary'='Keep these accepted terms') then
        raise exception 'rollback lost current policy';
      end if;
      perform public.undo_business_record_revision('bf305010-0000-4000-8000-000000000010',
        'bf305010-0000-4000-8000-000000000001','policy-rollback@example.test','owner',1,gen_random_uuid(),repeat('b',64));
    end $$;
  \else
    insert into public.users(id,email,verified_at) values
      ('bf305010-0000-4000-8000-000000000001','policy-rollback@example.test',now());
    insert into public.workspaces(id,kind,name,created_by) values
      ('bf305010-0000-4000-8000-000000000010','customer','Rollback fixture','bf305010-0000-4000-8000-000000000001');
    insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
      ('bf305010-0000-4000-8000-000000000010','bf305010-0000-4000-8000-000000000001','owner','bf305010-0000-4000-8000-000000000001');
    select public.patch_business_record('bf305010-0000-4000-8000-000000000010',
      'bf305010-0000-4000-8000-000000000001','policy-rollback@example.test','owner',0,
      '{"facts":{"cancellation":{"value":{"summary":"Keep these accepted terms"},"verified":true}}}',gen_random_uuid(),repeat('a',64));
  \endif
\endif
