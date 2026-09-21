-- Keep request provenance separate from actual content-field changes.
-- Historical versions have no request reference; no provenance is invented.
alter table public.content_versions add column request_id text;
create index content_versions_tenant_request_idx
  on public.content_versions (tenant_id, request_id)
  where request_id is not null;
