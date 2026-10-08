\set ON_ERROR_STOP on
-- Aggregate rehearsal: actual committed native terms and pure reader/catalog
-- proof. Genuine concurrent writer order is tested separately by the race script.
\ir support/payer-authority-race-fixture.sql
select public.work_allowance_accept_cap('a9050000-0000-4000-8000-000000000002',
 'payer-race-agency@example.test',(select id from public.work_allowances where award_key='payer-race-allowance'));
drop trigger payer_race_timing on public.work_allowances;
drop schema payer_race_fixture cascade;
update public.workspace_memberships set role='member'
 where workspace_id='a9050000-0000-4000-8000-000000000020'
 and user_id='a9050000-0000-4000-8000-000000000002';
\ir payer-authority-writer-schema.sql
