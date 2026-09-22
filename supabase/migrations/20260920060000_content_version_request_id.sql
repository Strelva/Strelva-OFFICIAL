-- Keep request provenance separate from actual content-field changes.
-- Historical versions have no request reference; no provenance is invented.
-- Fail immediately if a client currently holds a conflicting lock. Never queue
-- an ACCESS EXCLUSIVE request behind client traffic. The nullable column is a
-- metadata-only change; build its index separately without blocking writers.
do $$
begin
  lock table public.content_versions in access exclusive mode nowait;
  alter table public.content_versions add column request_id text;
end;
$$;
