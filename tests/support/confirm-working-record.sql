-- Fixture step: the owner has confirmed what a fixture seeded straight into
-- the working record (#509). Fixtures that insert business_record_facts or
-- business_services rows directly have no owner revision, so after
-- 20261011133700 nothing is confirmed and every customer-facing reader
-- (bookings, inquiries, the linked-site overlay) sees an empty record.
-- p_sources limits which working rows count as decided (null: all of them).
-- A no-op before 20261011133700 exists. Session-local; include with \ir.
create or replace function pg_temp.confirm_working_record(p_workspace_id uuid, p_sources text[] default null) returns void
language plpgsql as $$
begin
  if to_regclass('public.business_record_confirmed') is null then return; end if;
  insert into public.business_record_confirmed(workspace_id, entity, entity_id, state, confirmed_by_kind)
    select p_workspace_id, 'fact', f.fact_key, public.business_record_entity_state(p_workspace_id, 'fact', f.fact_key), 'owner_write'
      from public.business_record_facts f where f.workspace_id = p_workspace_id and (p_sources is null or f.source = any(p_sources))
    union all
    select p_workspace_id, 'service', s.id::text, public.business_record_entity_state(p_workspace_id, 'service', s.id::text), 'owner_write'
      from public.business_services s where s.workspace_id = p_workspace_id and (p_sources is null or s.source = any(p_sources))
  on conflict (workspace_id, entity, entity_id) do update set state = excluded.state,
    confirmed_by_kind = 'owner_write', decision_id = null, revision_sequence = null, confirmed_at = clock_timestamp();
end $$;
