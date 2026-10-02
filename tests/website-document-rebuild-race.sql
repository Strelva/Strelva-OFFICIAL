\set ON_ERROR_STOP on
begin;
set local role service_role;
select id from public.claim_website_rebuild(
 '61000000-0000-4000-8000-000000000002',
 '61000000-0000-4000-8000-000000000005',
 'v2-member@example.test', :'request_id', 'race.example.test',
 '{"url":"https://race.example.test"}',
 '{"version":2,"revision":0,"title":"Fictional race","status":"building","createdBy":"61000000-0000-4000-8000-000000000005","createdAt":"2026-10-01T12:00:00Z","history":[]}'
);
-- Keep the winner's workspace lock across the competing claim.
select pg_sleep(0.25);
commit;
