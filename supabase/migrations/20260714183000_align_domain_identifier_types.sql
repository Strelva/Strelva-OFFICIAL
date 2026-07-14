-- Align persisted identifiers with the domain identifiers emitted by the
-- application. Workflow events and suggestions deliberately use readable,
-- type-prefixed ids (`evt_*` and `sug_*`) throughout Redis, URLs, metadata, and
-- logs. The original migration declared these columns as UUIDs, which rejected
-- every application-supplied id and made the event mirror / suggestion store
-- silently incomplete.

alter table unified_events
  alter column id drop default,
  alter column id type text using id::text;

alter table suggestions
  alter column id drop default,
  alter column id type text using id::text;
