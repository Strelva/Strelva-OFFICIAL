\set ON_ERROR_STOP on
-- #509 backfill fixture. Runs with 20261011133700 rolled back and COMMITS
-- one fictional business whose owner decided facts that providers later
-- overwrote, deleted and undid; business-facts-owner-decision-backfill.sql
-- checks what the forward migration confirmed. Never connects to production.
begin;
do $$
declare
  ws uuid := '65091000-0000-4000-8000-000000000001';
  owner_id uuid := '65091000-0000-4000-8000-000000000002';
  operator_id uuid := '62000000-0000-4000-8000-000000000102';
  rev bigint := 0; hours_seq bigint; email_seq bigint;
begin
  if to_regclass('public.business_record_confirmed') is not null then raise exception 'backfill fixture needs the migration rolled back'; end if;
  insert into public.users(id, email, verified_at) values (owner_id, 'fb-owner@example.test', now());
  insert into public.workspaces(id, kind, name, created_by) values (ws, 'customer', 'Fictional backfill business', owner_id);
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values (ws, owner_id, 'owner', owner_id), (ws, operator_id, 'admin', owner_id);
  -- The owner decides phone, name, email and description.
  perform public.patch_business_record(ws, owner_id, 'fb-owner@example.test', 'owner', rev,
    '{"facts":{"phone":{"value":"716-555-0301"},"display_name":{"value":"Owner Backfill Co"},"email":{"value":"owner@backfill.example.test"},"description":{"value":"Owner copy."}}}',
    gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  -- The owner deletes the description; then sets hours on their own.
  perform public.patch_business_record(ws, owner_id, 'fb-owner@example.test', 'owner', rev, '{"facts":{"description":null}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  perform public.patch_business_record(ws, owner_id, 'fb-owner@example.test', 'owner', rev,
    '{"facts":{"hours":{"value":{"timezone":"America/New_York","weekly":[{"day":2,"opens":"08:00","closes":"16:00"}]}}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  hours_seq := (select max(sequence) from public.business_record_revisions where workspace_id = ws);
  -- An operator overwrites the phone, deletes the name and re-adds a description.
  perform public.patch_business_record(ws, operator_id, 'lp-operator@example.test', 'operator', rev,
    '{"facts":{"phone":{"value":"716-555-0399","verified":true},"display_name":null,"description":{"value":"Operator copy."}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  -- An operator undoes the owner's hours: a provider deletion, still pending.
  perform public.undo_business_record_revision(ws, operator_id, 'lp-operator@example.test', 'operator', hours_seq, gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  -- An operator changes the email and the owner undoes it: back to the owner's.
  perform public.patch_business_record(ws, operator_id, 'lp-operator@example.test', 'operator', rev,
    '{"facts":{"email":{"value":"operator@backfill.example.test"}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  email_seq := (select max(sequence) from public.business_record_revisions where workspace_id = ws);
  perform public.undo_business_record_revision(ws, owner_id, 'fb-owner@example.test', 'owner', email_seq, gen_random_uuid(), repeat('b', 64));
end $$;
commit;
