create or replace function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin if not ok then raise exception 'assertion failed: %',message; end if; end $$;

insert into public.users(id,email,verified_at) values
  ('91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test',clock_timestamp()),
  ('92bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','new@example.test',clock_timestamp()),
  ('93cccccc-cccc-4ccc-8ccc-cccccccccccc','existing@example.test',clock_timestamp()),
  ('94dddddd-dddd-4ddd-8ddd-dddddddddddd','wrong@example.test',clock_timestamp()),
  ('95eeeeee-eeee-4eee-8eee-eeeeeeeeeeee','member@example.test',clock_timestamp()),
  ('96ffffff-ffff-4fff-8fff-ffffffffffff','revoked@example.test',clock_timestamp()),
  ('97aaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','raced@example.test',clock_timestamp()),
  ('98bbbbbb-cccc-4ddd-8eee-ffffffffffff','removed@example.test',clock_timestamp());

insert into public.workspaces(id,kind,name,created_by) values
  ('90111111-1111-4111-8111-111111111111','customer','Invitation Test Business','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('90111111-1111-4111-8111-111111111111','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('90111111-1111-4111-8111-111111111111','93cccccc-cccc-4ccc-8ccc-cccccccccccc','admin','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('90111111-1111-4111-8111-111111111111','95eeeeee-eeee-4eee-8eee-eeeeeeeeeeee','member','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

do $$
declare
  created public.workspace_invitations%rowtype;
  accepted record;
  caught text;
begin
  select * into created from public.create_workspace_invitation(
    '90111111-1111-4111-8111-111111111111','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','OWNER@example.test',
    'NEW@example.test','member',repeat('a',64),clock_timestamp()+interval '7 days');
  perform pg_temp.assert_true(created.recipient_email='new@example.test','recipient email is normalized');
  perform pg_temp.assert_true(created.status='pending','new invitation is pending');
  perform pg_temp.assert_true((select workspace_name from public.inspect_workspace_invitation(repeat('a',64)))='Invitation Test Business','preview exposes only joined terms');

  begin
    perform public.accept_workspace_invitation(repeat('a',64),'94dddddd-dddd-4ddd-8ddd-dddddddddddd','wrong@example.test');
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='workspace_invitation_recipient_mismatch','wrong verified account is denied');
  perform pg_temp.assert_true(not exists(select 1 from public.workspace_memberships where workspace_id=created.workspace_id and user_id='94dddddd-dddd-4ddd-8ddd-dddddddddddd'),'wrong account gains no membership');

  select * into accepted from public.accept_workspace_invitation(
    repeat('a',64),'92bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','new@example.test');
  perform pg_temp.assert_true(accepted.invitation_status='accepted' and not accepted.already_accepted,'addressed recipient explicitly accepts');
  perform pg_temp.assert_true((select role from public.workspace_memberships where workspace_id=created.workspace_id and user_id='92bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')='member','acceptance grants intended membership');
  select * into accepted from public.accept_workspace_invitation(
    repeat('a',64),'92bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','new@example.test');
  perform pg_temp.assert_true(accepted.already_accepted,'repeat accept returns the terminal receipt');
  perform pg_temp.assert_true((select count(*) from public.workspace_memberships where workspace_id=created.workspace_id and user_id='92bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')=1,'repeat accept creates no duplicate membership');

  perform public.create_workspace_invitation(
    created.workspace_id,'91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test',
    'existing@example.test','member',repeat('b',64),clock_timestamp()+interval '7 days');
  select * into accepted from public.accept_workspace_invitation(
    repeat('b',64),'93cccccc-cccc-4ccc-8ccc-cccccccccccc','existing@example.test');
  perform pg_temp.assert_true(accepted.applied_role='admin','existing higher role is retained');
  perform pg_temp.assert_true((select role from public.workspace_memberships where workspace_id=created.workspace_id and user_id='93cccccc-cccc-4ccc-8ccc-cccccccccccc')='admin','acceptance never downgrades membership');

  perform public.create_workspace_invitation(
    created.workspace_id,'91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test',
    'raced@example.test','member',repeat('e',64),clock_timestamp()+interval '7 days');

  caught:=null;
  begin
    perform public.create_workspace_invitation(
      created.workspace_id,'95eeeeee-eeee-4eee-8eee-eeeeeeeeeeee','member@example.test',
      'other@example.test','member',repeat('f',64),clock_timestamp()+interval '7 days');
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='workspace_invitation_owner_required','non-owner cannot invite');
end $$;

do $$
declare
  created public.workspace_invitations%rowtype;
  caught text;
begin
  select * into created from public.create_workspace_invitation(
    '90111111-1111-4111-8111-111111111111','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test',
    'removed@example.test','member',repeat('8',64),clock_timestamp()+interval '7 days');
  delete from public.workspace_memberships
    where workspace_id=created.workspace_id and user_id='91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  begin
    perform public.accept_workspace_invitation(
      repeat('8',64),'98bbbbbb-cccc-4ddd-8eee-ffffffffffff','removed@example.test');
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='workspace_invitation_sponsor_invalid','removed sponsor cannot grant pending access');
  perform pg_temp.assert_true(not exists(select 1 from public.workspace_memberships where workspace_id=created.workspace_id and user_id='98bbbbbb-cccc-4ddd-8eee-ffffffffffff'),'removed sponsor causes no membership effect');
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
    values(created.workspace_id,'91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
end $$;

-- Inject an owner membership from a second connection after
-- accept_workspace_invitation observes no row but before its insert resolves
-- the primary-key conflict. This exercises the real concurrency branch.
create extension if not exists dblink;
create or replace function pg_temp.inject_stronger_invitation_membership() returns trigger
language plpgsql as $$
begin
  if new.user_id='97aaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    and current_setting('strelva.invitation_race',true)='on' then
    perform dblink_exec(
      format('host=%s port=%s dbname=%s',split_part(current_setting('unix_socket_directories'),',',1),current_setting('port'),current_database()),
      format(
        'insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(%L,%L,%L,%L)',
        new.workspace_id,new.user_id,'owner',new.created_by
      )
    );
  end if;
  return new;
end $$;
create trigger workspace_invitation_stronger_membership_race
  before insert on public.workspace_memberships
  for each row execute function pg_temp.inject_stronger_invitation_membership();

do $$
declare accepted record;
begin
  perform set_config('strelva.invitation_race','on',true);
  select * into accepted from public.accept_workspace_invitation(
    repeat('e',64),'97aaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','raced@example.test');
  perform pg_temp.assert_true(accepted.applied_role='owner','concurrent stronger membership is returned');
  perform pg_temp.assert_true((select role from public.workspace_memberships where workspace_id=accepted.workspace_id and user_id='97aaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')='owner','concurrent stronger membership cannot be downgraded');
end $$;

drop trigger workspace_invitation_stronger_membership_race on public.workspace_memberships;

do $$
declare
  created public.workspace_invitations%rowtype;
  caught text;
begin
  select * into created from public.create_workspace_invitation(
    '90111111-1111-4111-8111-111111111111','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test',
    'wrong@example.test','member',repeat('9',64),clock_timestamp()+interval '7 days');
  update public.workspace_memberships set role='member'
    where workspace_id=created.workspace_id and user_id='91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  begin
    perform public.accept_workspace_invitation(
      repeat('9',64),'94dddddd-dddd-4ddd-8ddd-dddddddddddd','wrong@example.test');
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='workspace_invitation_sponsor_invalid','demoted sponsor cannot grant pending access');
  perform pg_temp.assert_true(not exists(select 1 from public.workspace_memberships where workspace_id=created.workspace_id and user_id='94dddddd-dddd-4ddd-8ddd-dddddddddddd'),'invalid sponsor causes no membership effect');
  update public.workspace_memberships set role='owner'
    where workspace_id=created.workspace_id and user_id='91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
end $$;

do $$
declare
  created public.workspace_invitations%rowtype;
  accepted record;
begin
  select * into created from public.create_workspace_invitation(
    '90111111-1111-4111-8111-111111111111','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test',
    'revoked@example.test','member',repeat('c',64),clock_timestamp()+interval '7 days');
  perform pg_temp.assert_true(public.revoke_workspace_invitation(created.id,'91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test')='revoked','owner revokes pending invitation');
  select * into accepted from public.accept_workspace_invitation(
    repeat('c',64),'96ffffff-ffff-4fff-8fff-ffffffffffff','revoked@example.test');
  perform pg_temp.assert_true(accepted.invitation_status='revoked','revoked invitation is terminal');
  perform pg_temp.assert_true(not exists(select 1 from public.workspace_memberships where workspace_id=created.workspace_id and user_id='96ffffff-ffff-4fff-8fff-ffffffffffff'),'revoked invitation grants no membership');
end $$;

do $$
declare
  created public.workspace_invitations%rowtype;
  accepted record;
begin
  select * into created from public.create_workspace_invitation(
    '90111111-1111-4111-8111-111111111111','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@example.test',
    'new@example.test','admin',repeat('d',64),clock_timestamp()+interval '7 days');
  update public.workspace_invitations set expires_at=clock_timestamp()-interval '1 second' where id=created.id;
  select * into accepted from public.accept_workspace_invitation(
    repeat('d',64),'92bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','new@example.test');
  perform pg_temp.assert_true(accepted.invitation_status='expired','expired invitation is terminal');
  perform pg_temp.assert_true((select role from public.workspace_memberships where workspace_id=created.workspace_id and user_id='92bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')='member','expired invitation grants no promotion');
end $$;

select 'workspace invitation checks passed' as result;
