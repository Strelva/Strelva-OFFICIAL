-- #6 CONTRACT (pragmatic path, 2026-07-15): make the tenant subdomain slug
-- RENAMABLE. Today every tenant_id FK is `on delete cascade` but NOT
-- `on update cascade`, so `UPDATE tenants SET id = 'newslug'` fails (children still
-- reference the old id). Add `on update cascade` to every slug FK so a rename
-- propagates atomically to all ~35 child tables in one UPDATE. The app-side rename
-- procedure then re-keys Redis. Purist UUID-identity spine is shelved; EXPAND's
-- tenant_stable_id mirror stays as option value.
--
-- Discovers the FKs from the catalog (not hard-coded names) and preserves each
-- one's existing ON DELETE rule (33 cascade + 2 set null), only ADDING on-update.
-- Transactional → atomic. Reversible: re-add each FK without `on update cascade`.
-- The stable_id mirror FKs (referencing tenants.stable_id, which never changes) are
-- intentionally left untouched.

do $$
declare r record;
begin
  for r in
    select con.conname, cl.relname as table_name, con.confdeltype
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
    join pg_class ref on ref.oid = con.confrelid
    where con.contype = 'f'
      and ref.relname = 'tenants'
      -- referenced column is tenants.id (the slug), not stable_id
      and (select attname from pg_attribute where attrelid = con.confrelid and attnum = con.confkey[1]) = 'id'
      -- referencing column is tenant_id
      and (select attname from pg_attribute where attrelid = con.conrelid and attnum = con.conkey[1]) = 'tenant_id'
      -- not already on-update-cascade (idempotent re-run)
      and con.confupdtype <> 'c'
  loop
    execute format('alter table public.%I drop constraint %I', r.table_name, r.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (tenant_id) references tenants(id) %s on update cascade',
      r.table_name,
      r.conname,
      case r.confdeltype when 'c' then 'on delete cascade' when 'n' then 'on delete set null' else '' end
    );
    raise notice 'rekeyable FK: %.% (% on delete)', r.table_name, r.conname, r.confdeltype;
  end loop;
end $$;
