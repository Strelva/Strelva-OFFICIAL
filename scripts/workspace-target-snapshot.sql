-- Catalog metadata only. This script neither reads customer rows nor changes grants or schema.
-- Run against the explicitly identified target using an authorized read-only connection.
-- Example: psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -f scripts/workspace-target-snapshot.sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT json_build_object(
  'version', 1,
  'observedAt', CURRENT_TIMESTAMP,
  'relations', (
    SELECT COALESCE(json_agg(json_build_object(
      'name', c.relname,
      'kind', c.relkind,
      'rlsEnabled', c.relrowsecurity
    ) ORDER BY c.relname), '[]'::json)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
  ),
  'migrations', (
    SELECT COALESCE(json_agg(json_build_object('version', version, 'name', name) ORDER BY version), '[]'::json)
    FROM supabase_migrations.schema_migrations
  )
);
COMMIT;
