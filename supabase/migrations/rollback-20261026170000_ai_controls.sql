-- Refuse to erase controls that an agency or operator is relying on, or
-- unresolved cost commitments. Lift the controls and resolve the holds first.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists(select 1 from public.business_ai_controls where paused or monthly_cap_cents is not null or review_auto_post <> 'client_choice') then
    raise exception 'ai_controls_rollback_has_active_controls';
  end if;
  if exists(select 1 from public.business_ai_budget_reservations where ceiling_source = 'list_price') then
    raise exception 'ai_controls_rollback_has_list_price_reservations';
  end if;
end $$;
drop function public.set_operator_ai_controls(text,uuid,boolean,integer,text,bigint,text);
drop function public.read_operator_ai_controls(text,uuid);
drop function public.operator_ai_controls_view(uuid);
drop function public.set_agency_ai_controls(uuid,uuid,uuid,text,boolean,integer,text,bigint,text);
drop function public.read_agency_ai_controls(uuid,uuid,text,uuid);
drop function public.agency_ai_controls_scope(uuid,uuid,uuid,text,boolean);
drop function public.reserve_business_ai_budget_v2(uuid,numeric,numeric,boolean,text);
drop function public.business_ai_budget_v2(uuid);
drop function public.business_ai_controls_state(uuid);
alter table public.business_ai_budget_reservations drop column ceiling_source;
drop table public.business_ai_control_changes;
drop table public.business_ai_controls;
commit;
