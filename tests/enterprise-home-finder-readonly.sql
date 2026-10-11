\set ON_ERROR_STOP on
-- Disposable database only. Persist fictional seeds before genuine READ ONLY calls.
begin;
insert into public.users(id,email,verified_at) select ('27410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'enterprise-read-'||n||'@example.test',case when n=6 then null else now() end from generate_series(1,6)n;
insert into public.workspaces(id,kind,name,created_by) select ('27410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=20 then 'agency' else 'customer' end,'Enterprise readonly fixture '||n,'27410000-0000-4000-8000-000000000001' from unnest(array[10,11,12,20])n;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select ('27410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'27410000-0000-4000-8000-000000000001','owner','27410000-0000-4000-8000-000000000001' from unnest(array[10,11,20])n;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select ('27410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'27410000-0000-4000-8000-000000000002','member','27410000-0000-4000-8000-000000000001' from unnest(array[10,11])n;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select '27410000-0000-4000-8000-000000000020',('27410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=3 then 'owner' else 'member' end,'27410000-0000-4000-8000-000000000001' from unnest(array[3,4])n;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select ('27410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'27410000-0000-4000-8000-000000000006','member','27410000-0000-4000-8000-000000000001' from unnest(array[10,11])n;
select public.choose_business_provider('27410000-0000-4000-8000-000000000001','enterprise-read-1@example.test','27410000-0000-4000-8000-000000000011','27410000-0000-4000-8000-000000000020');
select public.set_agency_client_staff('27410000-0000-4000-8000-000000000003','enterprise-read-3@example.test','27410000-0000-4000-8000-000000000020','27410000-0000-4000-8000-000000000011','27410000-0000-4000-8000-000000000003',true);
select public.change_enterprise_unit('27410000-0000-4000-8000-000000000001','enterprise-read-1@example.test','{"action":"put","organizationId":"27410000-0000-4000-8000-000000000010","id":"27410000-0000-4000-8000-000000000061","businessId":"27410000-0000-4000-8000-000000000011","name":"Read only location","kind":"location","expectedRevision":0}');
select public.install_home_finder('27410000-0000-4000-8000-000000000001','enterprise-read-1@example.test',jsonb_build_object('workspaceId','27410000-0000-4000-8000-000000000011','agencyId','27410000-0000-4000-8000-000000000020','commandId','27410000-0000-4000-8000-000000000064','name','Fictional readonly search','externalInstallationId','fictional-readonly-idx','brokerageName','Fictional Readonly Brokerage','approvedOrigin','https://readonly-brokerage.example.test','licenseReference','fictional-only','licenseExpiresAt',now()+interval '1 day','sourceName','Fictional Readonly Source'),repeat('d',64));
commit;

begin read only;
do $$ declare actor uuid; email text; view jsonb; choices jsonb; bindings jsonb;
begin
 if current_setting('transaction_read_only')<>'on' then raise exception 'enterprise fixture not READ ONLY'; end if;
 for n in 1..2 loop
  actor:=('27410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;email:='enterprise-read-'||n||'@example.test';
  view:=public.read_enterprise_units('27410000-0000-4000-8000-000000000010',actor,email);
  choices:=public.read_enterprise_unit_versions('27410000-0000-4000-8000-000000000010','27410000-0000-4000-8000-000000000061',actor,email);
  bindings:=public.read_home_finder_bindings('27410000-0000-4000-8000-000000000011',actor,email);
  if jsonb_array_length(view->'units')<>1 or view->>'inaccessibleUnits'<>'0' or choices->>'businessId'<>'27410000-0000-4000-8000-000000000011' or jsonb_array_length(choices->'versions')<>0 or jsonb_array_length(bindings)<>1 or bindings#>>'{0,id}'<>'27410000-0000-4000-8000-000000000064' then raise exception 'owner/member scoped reader mismatch'; end if;
 end loop;
 -- Current staffed seat may read the client's Systems; it confers no organization membership.
 bindings:=public.read_home_finder_bindings('27410000-0000-4000-8000-000000000011','27410000-0000-4000-8000-000000000003','enterprise-read-3@example.test');
 if jsonb_array_length(bindings)<>1 then raise exception 'current scoped agency read denied'; end if;
 for n in 3..6 loop
  actor:=('27410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;email:='enterprise-read-'||n||'@example.test';
  begin perform public.read_enterprise_units('27410000-0000-4000-8000-000000000010',actor,email);raise exception 'nonmember/unverified organization admitted';exception when others then if sqlerrm<>'enterprise_denied' then raise;end if;end;
  begin perform public.read_enterprise_unit_versions('27410000-0000-4000-8000-000000000010','27410000-0000-4000-8000-000000000061',actor,email);raise exception 'nonmember/unverified Versions admitted';exception when others then if sqlerrm<>'enterprise_denied' then raise;end if;end;
 end loop;
 for n in 4..6 loop
  actor:=('27410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;email:='enterprise-read-'||n||'@example.test';
  begin perform public.read_home_finder_bindings('27410000-0000-4000-8000-000000000011',actor,email);raise exception 'unscoped/unverified installation admitted';exception when others then if sqlerrm<>'business_record_access_denied' then raise;end if;end;
 end loop;
 begin perform public.read_enterprise_units('27410000-0000-4000-8000-000000000010','27410000-0000-4000-8000-000000000001','wrong@example.test');raise exception 'mismatched verified email admitted';exception when others then if sqlerrm<>'enterprise_denied' then raise;end if;end;
end $$;
commit;

-- Withdrawal must affect the next snapshot; another still-active business is not a substitute.
begin;
select public.end_provider_seat('27410000-0000-4000-8000-000000000001','enterprise-read-1@example.test','27410000-0000-4000-8000-000000000011','27410000-0000-4000-8000-000000000020','End readonly fixture seat');
delete from public.workspace_memberships where workspace_id='27410000-0000-4000-8000-000000000011' and user_id='27410000-0000-4000-8000-000000000002';
commit;
begin read only;
do $$ declare view jsonb;
begin
 if current_setting('transaction_read_only')<>'on' then raise exception 'withdrawal fixture not READ ONLY'; end if;
 view:=public.read_enterprise_units('27410000-0000-4000-8000-000000000010','27410000-0000-4000-8000-000000000002','enterprise-read-2@example.test');
 if jsonb_array_length(view->'units')<>0 or view->>'inaccessibleUnits'<>'1' then raise exception 'withdrawn business Unit details leaked';end if;
 begin perform public.read_enterprise_unit_versions('27410000-0000-4000-8000-000000000010','27410000-0000-4000-8000-000000000061','27410000-0000-4000-8000-000000000002','enterprise-read-2@example.test');raise exception 'withdrawn business Versions admitted';exception when others then if sqlerrm<>'enterprise_denied' then raise;end if;end;
 for n in 2..3 loop
  begin perform public.read_home_finder_bindings('27410000-0000-4000-8000-000000000011',('27410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'enterprise-read-'||n||'@example.test');raise exception 'withdrawn member/seat admitted';exception when others then if sqlerrm<>'business_record_access_denied' then raise;end if;end;
 end loop;
 perform public.read_enterprise_units('27410000-0000-4000-8000-000000000010','27410000-0000-4000-8000-000000000001','enterprise-read-1@example.test');
 perform public.read_enterprise_unit_versions('27410000-0000-4000-8000-000000000010','27410000-0000-4000-8000-000000000061','27410000-0000-4000-8000-000000000001','enterprise-read-1@example.test');
 perform public.read_home_finder_bindings('27410000-0000-4000-8000-000000000011','27410000-0000-4000-8000-000000000001','enterprise-read-1@example.test');
end $$;
commit;
