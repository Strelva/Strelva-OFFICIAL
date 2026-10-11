-- Rollback for 20261005120100_workspace_authority_write_rpcs.sql
-- Forward SHA-256: deede275f8a0972fe6ad5dca38204cbbee5bbe269d879c027faac1799a7da202
-- Batch 1: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.revoke_workspace_handoff(uuid,uuid)')))) is distinct from '099b54e75920d7ed47beb5200f5f3ee7' then raise exception 'rollback_wrong_order_or_function_drift: revoke_workspace_handoff'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.revoke_workspace_delegation(uuid,uuid)')))) is distinct from 'bb93da4d296f4abd60a2796bd4bfd2c7' then raise exception 'rollback_wrong_order_or_function_drift: revoke_workspace_delegation'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.save_workspace_calendar_event_receipt(uuid,jsonb)')))) is distinct from 'c9a8de92b3b517fa4aef8019a7bcd888' then raise exception 'rollback_wrong_order_or_function_drift: save_workspace_calendar_event_receipt'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.revoke_workspace_calendar_connection(uuid,uuid,text)')))) is distinct from 'f9ef2b3f28f66b8b412e65a4bda8518e' then raise exception 'rollback_wrong_order_or_function_drift: revoke_workspace_calendar_connection'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.mark_workspace_calendar_connection_error(uuid,uuid,text,text)')))) is distinct from '0f897a877621c11f9c960020bcee5969' then raise exception 'rollback_wrong_order_or_function_drift: mark_workspace_calendar_connection_error'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.save_workspace_work(uuid,uuid,text,text,text,jsonb,jsonb,uuid)')))) is distinct from '375ed0e18486497894f51486d1defd46' then raise exception 'rollback_wrong_order_or_function_drift: save_workspace_work'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.create_workspace_handoff(uuid,uuid,text,text,timestamp with time zone)')))) is distinct from '73713c76021a98b60b332242f04ef64b' then raise exception 'rollback_wrong_order_or_function_drift: create_workspace_handoff'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.save_workspace_calendar_connection(uuid,uuid,text,text,text,text,text,text[],text,text,timestamp with time zone,jsonb)')))) is distinct from 'b07166fa2503017680271b3ac1337331' then raise exception 'rollback_wrong_order_or_function_drift: save_workspace_calendar_connection'; end if;
end;
$rollback_guard$;
drop function public.revoke_workspace_handoff(uuid,uuid);
drop function public.revoke_workspace_delegation(uuid,uuid);
drop function public.save_workspace_calendar_event_receipt(uuid,jsonb);
drop function public.revoke_workspace_calendar_connection(uuid,uuid,text);
drop function public.mark_workspace_calendar_connection_error(uuid,uuid,text,text);
drop function public.save_workspace_work(uuid,uuid,text,text,text,jsonb,jsonb,uuid);
drop function public.create_workspace_handoff(uuid,uuid,text,text,timestamp with time zone);
drop function public.save_workspace_calendar_connection(uuid,uuid,text,text,text,text,text,text[],text,text,timestamp with time zone,jsonb);
commit;
