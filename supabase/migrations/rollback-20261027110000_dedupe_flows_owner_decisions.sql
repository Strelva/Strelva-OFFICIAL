begin;
set local lock_timeout = '3s';

drop function if exists public.record_policy_owner_decision(uuid, jsonb, text);
drop function if exists public.read_open_owner_decision_for_source(uuid, text, text);

-- Policy rows are receipts only; their source events keep their own receipt.
delete from public.owner_decisions where decided_by_kind = 'policy' or route = 'handle_after_notice';

alter table public.owner_decisions drop constraint if exists owner_decisions_policy_route_closed;
alter table public.owner_decisions drop constraint if exists owner_decisions_route_check;
alter table public.owner_decisions add constraint owner_decisions_route_check check (route in ('strelva_reviews','owner_decides'));
alter table public.owner_decisions drop constraint if exists owner_decisions_decided_by_kind_check;
alter table public.owner_decisions add constraint owner_decisions_decided_by_kind_check check (decided_by_kind is null or decided_by_kind in
  ('owner_link','owner_session','admin_session','member_session','agency_session','operator','expiry','system'));

commit;
