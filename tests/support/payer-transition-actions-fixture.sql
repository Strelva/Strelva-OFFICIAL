-- Fictional identities used only by disposable SQL checks.
create or replace function pg_temp.pta_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'payer transition actions assertion failed: %', message; end if; end $$;
create or replace function pg_temp.pta_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected refusal % but statement succeeded: %', expected, statement;
end $$;
insert into public.users(id,email,verified_at) values
 ('b2780000-0000-4000-8000-000000000001','pta-owner@example.test',now()),
 ('b2780000-0000-4000-8000-000000000002','pta-agency-owner@example.test',now()),
 ('b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test',now()),
 ('b2780000-0000-4000-8000-000000000004','pta-agency-member@example.test',now()),
 ('b2780000-0000-4000-8000-000000000005','pta-other@example.test',now()),
 ('b2780000-0000-4000-8000-000000000006','pta-person@example.test',now()),
 ('b2780000-0000-4000-8000-000000000007','pta-business-admin@example.test',now()),
 ('b2780000-0000-4000-8000-000000000008','pta-unverified@example.test',null),
 ('b2780000-0000-4000-8000-000000000009','pta-second-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('b2780000-0000-4000-8000-000000000010','customer','Payer UI Business','b2780000-0000-4000-8000-000000000001'),
 ('b2780000-0000-4000-8000-000000000011','customer','Payer UI Business Two','b2780000-0000-4000-8000-000000000001'),
 ('b2780000-0000-4000-8000-000000000020','agency','Payer UI Agency','b2780000-0000-4000-8000-000000000002'),
 ('b2780000-0000-4000-8000-000000000021','agency','Other Payer UI Agency','b2780000-0000-4000-8000-000000000005');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000001','owner','b2780000-0000-4000-8000-000000000001'),
 ('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000009','owner','b2780000-0000-4000-8000-000000000001'),
 ('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000007','admin','b2780000-0000-4000-8000-000000000001'),
 ('b2780000-0000-4000-8000-000000000011','b2780000-0000-4000-8000-000000000001','owner','b2780000-0000-4000-8000-000000000001'),
 ('b2780000-0000-4000-8000-000000000020','b2780000-0000-4000-8000-000000000002','owner','b2780000-0000-4000-8000-000000000002'),
 ('b2780000-0000-4000-8000-000000000020','b2780000-0000-4000-8000-000000000003','admin','b2780000-0000-4000-8000-000000000002'),
 ('b2780000-0000-4000-8000-000000000020','b2780000-0000-4000-8000-000000000004','member','b2780000-0000-4000-8000-000000000002'),
 ('b2780000-0000-4000-8000-000000000020','b2780000-0000-4000-8000-000000000008','admin','b2780000-0000-4000-8000-000000000002'),
 ('b2780000-0000-4000-8000-000000000021','b2780000-0000-4000-8000-000000000005','owner','b2780000-0000-4000-8000-000000000005');
