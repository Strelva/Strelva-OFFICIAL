\set ON_ERROR_STOP on
select to_regclass('public.system_bundle_native_bindings') is not null as has_bundle_native_lifecycle \gset
\if :has_bundle_native_lifecycle
\i supabase/migrations/rollback-20261020090027_bundle_native_lifecycle.sql
\endif
\i supabase/migrations/rollback-20261020090025_system_bundles.sql
\i supabase/migrations/20261020090025_system_bundles.sql
\i tests/system-bundles-schema.sql
\if :has_bundle_native_lifecycle
\i supabase/migrations/20261020090027_bundle_native_lifecycle.sql
\endif
