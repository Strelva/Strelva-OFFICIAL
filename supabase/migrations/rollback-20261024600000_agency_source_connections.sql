-- Roll back 20261024600000: drop the agency source connections and events.
-- Refuses while any agency still holds a connection, so a rollback never
-- silently discards an agency's stored HighLevel grant. Disconnect first.
-- Events are hints only and are dropped with the table.
begin;
do $$
begin
  if exists (select 1 from public.agency_source_connections where status <> 'revoked') then
    raise exception 'agency_source_rollback_requires_disconnect';
  end if;
end;
$$;
drop trigger agency_source_connections_touch on public.agency_source_connections;
drop function public.agency_source_connections_touch();
drop table public.agency_source_events;
drop table public.agency_source_connections;
commit;
