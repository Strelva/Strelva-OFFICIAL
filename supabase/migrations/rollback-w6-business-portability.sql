-- Roll back code flags first; retained exit handoffs remain evidence.
begin;
set local lock_timeout = '3s';
drop function public.complete_workspace_exit_with_handoff(uuid,uuid,text,text,text,jsonb,text,text,text);
drop function public.read_workspace_exit_handoff_plan(uuid,uuid,text);
drop function public.read_business_portfolio_billing(text[]);
drop function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer);
alter function public.export_workspace_v3_category_before_w6(uuid,uuid,text,text,integer,integer) rename to export_workspace_v3_category;
grant execute on function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) to service_role;
create or replace function public.workspace_export_v3_categories() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['business_record','systems','linked_sites','leads','spam_held','inquiry_timelines','inquiry_first_replies','booking_config','bookings','reviews','content','billing']::text[]
$$;
commit;
