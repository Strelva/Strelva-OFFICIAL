-- CMS collections + reviews + suggestions.
--
-- collection_entries: the Collections CMS store (migration follow-on). Typed,
--   repeating content entries (blog posts, videos, products) a tenant owns. One
--   row per entry; the type-specific fields live in `data` jsonb, validated by a
--   code-side Zod registry (src/lib/cms/collection-types.ts). Distinct from the
--   singleton `content` table (one hero per tenant) — this is many-of-a-kind.
-- reviews: a synced cache of Google/Yelp/manual reviews (fed by the poll crons),
--   NOT authored content. external_id dedupes provider reviews.
-- suggestions: the AI suggestion queue (operational), Postgres home for the
--   Sanity `suggestion` doctype.
--
-- All three are tenant-scoped and get the standard member-or-super-admin RLS
-- policy (helpers app_is_super_admin()/app_tenant_ids() from 20260619140000_rls).

create table collection_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references tenants(id) on delete cascade,
  type        text not null,                     -- blog|video|product
  slug        text not null,
  status      text not null default 'draft',     -- draft|published
  data        jsonb not null,                    -- type-specific fields
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, type, slug)
);
create index collection_entries_lookup_idx on collection_entries (tenant_id, type, status);

create table reviews (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references tenants(id) on delete cascade,
  source      text not null,                     -- google|yelp|manual
  external_id text,                              -- provider review id (dedupe); null for manual
  author      text not null default '',
  rating      integer,
  text        text not null default '',
  review_date timestamptz,
  reply       text,
  replied_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (tenant_id, source, external_id)
);
create index reviews_tenant_date_idx on reviews (tenant_id, review_date desc);

create table suggestions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references tenants(id) on delete cascade,
  type        text not null,                     -- stale|missing|growth|engagement
  title       text not null,
  description text not null default '',
  action      text not null default '',
  section     text,
  status      text not null default 'pending',   -- pending|accepted|dismissed
  created_at  timestamptz not null default now()
);
create index suggestions_tenant_status_idx on suggestions (tenant_id, status);

-- RLS — standard tenant-scoped policy (member or super-admin; else nothing).
do $$
declare t text;
begin
  foreach t in array array['collection_entries','reviews','suggestions'] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$
      create policy %1$I_tenant_rw on %1$I for all to authenticated
      using (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
      with check (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
    $f$, t);
  end loop;
end $$;
