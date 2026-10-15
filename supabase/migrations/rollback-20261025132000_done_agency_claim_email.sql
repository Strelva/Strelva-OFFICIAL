begin;
set local lock_timeout = '3s';
lock table public.agency_client_owner_claims in access exclusive mode;
-- Preserve delivery receipts; rolling back the code cannot erase acceptance.
do $$ begin
  if (select count(*) from public.done_agency_claim_email_predecessor) <> 1
    or exists(select 1 from public.done_agency_claim_email_predecessor where definition_hash is distinct from md5(pg_get_functiondef('public.agency_client_owner_claim_guard()'::regprocedure))) then
    raise exception 'done_agency_claim_email_rollback_successor_conflict';
  end if;
  if exists(select 1 from public.agency_client_owner_claims where delivery->>'status' in ('sending','accepted','unknown')) then
    raise exception 'agency_claim_delivery_receipts_retained';
  end if;
end $$;
drop function public.record_agency_owner_claim_email(uuid,text,uuid,uuid,text,jsonb);
drop function public.prepare_agency_owner_claim_email(uuid,text,uuid,uuid,text);

do $$ declare original text; begin
  select definition into original from public.done_agency_claim_email_predecessor;
  execute original;
end $$;
drop table public.done_agency_claim_email_predecessor;
notify pgrst, 'reload schema';
commit;
