-- pg-delta: transaction=false
-- Supabase CLI 2.117.0 or psql, without a wrapping transaction. Existing targets
-- that applied the earlier combined migration already have this index. A failed
-- concurrent build may leave an invalid index: fail closed for explicit repair,
-- rather than treating IF NOT EXISTS as evidence that the index is usable.
set lock_timeout = '1s';
set statement_timeout = '60s';
create index concurrently if not exists content_versions_tenant_request_idx
  on public.content_versions (tenant_id, request_id)
  where request_id is not null;
do $$
begin
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'content_versions_tenant_request_idx'
      and i.indrelid = 'public.content_versions'::regclass
      and i.indisvalid and i.indisready and not i.indisunique
      and i.indnkeyatts = 2 and i.indnatts = 2
      and pg_get_indexdef(i.indexrelid, 1, true) = 'tenant_id'
      and pg_get_indexdef(i.indexrelid, 2, true) = 'request_id'
      and pg_get_expr(i.indpred, i.indrelid) = '(request_id IS NOT NULL)'
  ) then
    raise exception 'content_version_request_index_not_ready';
  end if;
end;
$$;
reset lock_timeout;
reset statement_timeout;
