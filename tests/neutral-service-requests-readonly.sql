\set ON_ERROR_STOP on
-- Disposable native schema only. Persist fictional seeds so the following
-- transaction is actually READ ONLY rather than a reader called in a writer.
begin;
insert into public.users(id,email,verified_at) values
 ('41e00000-0000-4000-8000-000000000001','neutral-read-owner@example.test',now()),
 ('41e00000-0000-4000-8000-000000000002','neutral-read-agency@example.test',now()),
 ('41e00000-0000-4000-8000-000000000003','neutral-read-outsider@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('41e00000-0000-4000-8000-000000000010','customer','Read-only neutral business','41e00000-0000-4000-8000-000000000001'),
 ('41e00000-0000-4000-8000-000000000020','agency','Read-only ordinary agency','41e00000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('41e00000-0000-4000-8000-000000000010','41e00000-0000-4000-8000-000000000001','owner','41e00000-0000-4000-8000-000000000001'),
 ('41e00000-0000-4000-8000-000000000020','41e00000-0000-4000-8000-000000000002','owner','41e00000-0000-4000-8000-000000000002');
select public.choose_business_provider('41e00000-0000-4000-8000-000000000001','neutral-read-owner@example.test','41e00000-0000-4000-8000-000000000010','41e00000-0000-4000-8000-000000000020');
select public.set_agency_client_staff('41e00000-0000-4000-8000-000000000002','neutral-read-agency@example.test','41e00000-0000-4000-8000-000000000020','41e00000-0000-4000-8000-000000000010','41e00000-0000-4000-8000-000000000002',true);
commit;

begin read only;
do $$
declare identity jsonb;
begin
  if current_setting('transaction_read_only')<>'on' then raise exception 'not READ ONLY'; end if;
  identity:=public.read_business_provider_identity('41e00000-0000-4000-8000-000000000001','neutral-read-owner@example.test','41e00000-0000-4000-8000-000000000010');
  if identity is distinct from '{"agencyWorkspaceId":"41e00000-0000-4000-8000-000000000020","name":"Read-only ordinary agency"}'::jsonb then raise exception 'owner identity mismatch'; end if;
  if public.read_business_provider_identity('41e00000-0000-4000-8000-000000000002','neutral-read-agency@example.test','41e00000-0000-4000-8000-000000000010') is distinct from identity then raise exception 'staffed agency identity mismatch'; end if;
  if jsonb_array_length(public.read_service_request_providers('41e00000-0000-4000-8000-000000000001','neutral-read-owner@example.test','41e00000-0000-4000-8000-000000000010'))<>1 then raise exception 'recipient identity mismatch'; end if;
  begin
    perform public.read_business_provider_identity('41e00000-0000-4000-8000-000000000003','neutral-read-outsider@example.test','41e00000-0000-4000-8000-000000000010');
    raise exception 'outsider admitted';
  exception when others then if sqlerrm<>'business_record_access_denied' then raise; end if; end;
end $$;
commit;

-- Current authority still matters on the next read after revocation.
begin;
select public.end_provider_seat('41e00000-0000-4000-8000-000000000001','neutral-read-owner@example.test','41e00000-0000-4000-8000-000000000010','41e00000-0000-4000-8000-000000000020','End fixture access');
commit;
begin read only;
do $$ begin
  begin
    perform public.read_business_provider_identity('41e00000-0000-4000-8000-000000000002','neutral-read-agency@example.test','41e00000-0000-4000-8000-000000000010');
    raise exception 'revoked staff admitted';
  exception when others then if sqlerrm<>'business_record_access_denied' then raise; end if; end;
  perform public.read_business_provider_identity('41e00000-0000-4000-8000-000000000001','neutral-read-owner@example.test','41e00000-0000-4000-8000-000000000010');
end $$;
commit;
