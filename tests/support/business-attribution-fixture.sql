\set ON_ERROR_STOP on
-- Real PostgreSQL, fictional local identities. No signup/conversion/provider proof.
begin;
create function pg_temp.ba_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'business attribution assertion: %',label;end if;end $$;
insert into public.users(id,email,verified_at) values
 ('b2840000-0000-4000-8000-000000000001','attribution-owner@example.test',now()),
 ('b2840000-0000-4000-8000-000000000002','attribution-agency@example.test',now()),
 ('b2840000-0000-4000-8000-000000000003','attribution-admin@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('b2840000-0000-4000-8000-000000000010','customer','Attribution fictional business','b2840000-0000-4000-8000-000000000001'),
 ('b2840000-0000-4000-8000-000000000020','agency','Attribution fictional agency','b2840000-0000-4000-8000-000000000002'),
 ('b2840000-0000-4000-8000-000000000021','agency','Original bringer, not current operator','b2840000-0000-4000-8000-000000000002'),
 ('b2840000-0000-4000-8000-000000000011','customer','Other business','b2840000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','owner','b2840000-0000-4000-8000-000000000001'),
 ('b2840000-0000-4000-8000-000000000020','b2840000-0000-4000-8000-000000000002','owner','b2840000-0000-4000-8000-000000000002'),
 ('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000003','admin','b2840000-0000-4000-8000-000000000001'),
 ('b2840000-0000-4000-8000-000000000011','b2840000-0000-4000-8000-000000000002','owner','b2840000-0000-4000-8000-000000000002');
create temporary table ba_provider as select public.choose_business_provider('b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000020') body;
commit;
