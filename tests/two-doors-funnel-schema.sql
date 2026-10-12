-- ADR 0015 (20261023144000): one funnel row per step per reference.
\set ON_ERROR_STOP 1
begin;
insert into public.users(id,email,verified_at) values ('7b000000-0000-4000-8000-000000000001','owner@funnel.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values ('7b000000-0000-4000-8000-0000000000b1','customer','Funnel Bakery','7b000000-0000-4000-8000-000000000001');
do $$
begin
  if not public.record_funnel_event('check_run','audit_0123456789abcdef0123456789abcdef',null,null) then raise exception 'first check_run not recorded'; end if;
  if public.record_funnel_event('check_run','audit_0123456789abcdef0123456789abcdef',null,null) then raise exception 'a repeat check_run was recorded twice'; end if;
  perform public.record_funnel_event('check_saved','audit_0123456789abcdef0123456789abcdef','7b000000-0000-4000-8000-0000000000b1',null);
  perform public.record_funnel_event('business_created','7b000000-0000-4000-8000-0000000000b1','7b000000-0000-4000-8000-0000000000b1',null);
  perform public.record_funnel_event('first_live','7b000000-0000-4000-8000-0000000000b1','7b000000-0000-4000-8000-0000000000b1',null);
  perform public.record_funnel_event('first_live','7b000000-0000-4000-8000-0000000000b1','7b000000-0000-4000-8000-0000000000b1',null);
  if (select count(*) from public.funnel_events) <> 4 then raise exception 'expected four funnel rows'; end if;
  begin perform public.record_funnel_event('signed_up','x',null,null); raise exception 'unknown step accepted';
  exception when check_violation then null; end;
end $$;
rollback;
