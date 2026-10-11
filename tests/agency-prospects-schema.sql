insert into public.users(id,email,verified_at) values
 ('b2770000-0000-4000-8000-000000000001','north@agency.test',now()),
 ('b2770000-0000-4000-8000-000000000002','south@agency.test',now()),
 ('b2770000-0000-4000-8000-000000000003','outsider@agency.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('b2770000-0000-4000-8000-000000000010','agency','Northside','b2770000-0000-4000-8000-000000000001'),
 ('b2770000-0000-4000-8000-000000000011','agency','Southside','b2770000-0000-4000-8000-000000000002'),
 ('b2770000-0000-4000-8000-000000000012','agency','Race fixture','b2770000-0000-4000-8000-000000000001'),
 ('b2770000-0000-4000-8000-000000000013','personal','Not an agency','b2770000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('b2770000-0000-4000-8000-000000000010','b2770000-0000-4000-8000-000000000001','member','b2770000-0000-4000-8000-000000000001'),
 ('b2770000-0000-4000-8000-000000000011','b2770000-0000-4000-8000-000000000002','owner','b2770000-0000-4000-8000-000000000002');
insert into public.agency_prospecting_profiles(workspace_id,slug,contact_url,contact_email,enabled,daily_check_quota,daily_lead_quota) values
 ('b2770000-0000-4000-8000-000000000010','northside','https://north.example/contact','north@agency.test',true,1,1),
 ('b2770000-0000-4000-8000-000000000011','southside','https://south.example/contact','south@agency.test',true,2,2),
 ('b2770000-0000-4000-8000-000000000012','race','https://race.example/contact','north@agency.test',true,1,1),
 ('b2770000-0000-4000-8000-000000000013','personal','https://personal.example/contact','outsider@agency.test',true,1,1);
select public.agency_prospect_admit('b2770000-0000-4000-8000-000000000010');
select public.agency_prospect_admit('b2770000-0000-4000-8000-000000000011');
select public.agency_prospect_capture('b2770000-0000-4000-8000-000000000010','monitor','scan_north','','SAME@PROSPECT.TEST','https://business.example','Business',40,'F');
select public.agency_prospect_capture('b2770000-0000-4000-8000-000000000011','audit','audit_south','South prospect','same@prospect.test','https://business.example','Business',60,'C');
-- Idempotent retry is free, and same email in a different agency stays separate.
select public.agency_prospect_capture('b2770000-0000-4000-8000-000000000010','monitor','scan_north','','same@prospect.test','https://business.example','Business',40,'F');
do $$ begin
  if (select count(*) from public.prospects) <> 2 then raise exception 'agency lead dedupe crossed boundaries'; end if;
  if (select leads from public.agency_prospect_quota where workspace_id='b2770000-0000-4000-8000-000000000010') <> 1 then raise exception 'retry consumed quota'; end if;
  begin
    perform public.agency_prospect_admit('b2770000-0000-4000-8000-000000000010');
    raise exception 'check quota allowed overflow';
  exception when others then if sqlerrm <> 'agency_prospect_quota' then raise; end if; end;
  begin
    perform public.agency_prospect_capture('b2770000-0000-4000-8000-000000000010','audit','second','Second','second@prospect.test',null,'Second',60,'C');
    raise exception 'lead quota allowed overflow';
  exception when others then if sqlerrm <> 'agency_prospect_quota' then raise; end if; end;
  begin
    perform public.agency_prospect_admit('b2770000-0000-4000-8000-000000000013');
    raise exception 'personal workspace accepted agency checks';
  exception when others then if sqlerrm <> 'agency_prospect_unavailable' then raise; end if; end;
  if exists(select 1 from public.agency_prospecting_profile('personal')) then raise exception 'personal profile publicly resolved'; end if;
  if (select count(*) from public.agency_prospect_list('b2770000-0000-4000-8000-000000000010','b2770000-0000-4000-8000-000000000001','north@agency.test')) <> 1 then raise exception 'member list failed'; end if;
  begin
    perform public.agency_prospect_list('b2770000-0000-4000-8000-000000000011','b2770000-0000-4000-8000-000000000001','north@agency.test');
    raise exception 'service read crossed agencies';
  exception when others then if sqlerrm <> 'agency_prospect_access' then raise; end if; end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','b2770000-0000-4000-8000-000000000001',false);
do $$ begin
  if (select count(*) from public.prospects) <> 1 or exists(select 1 from public.prospects where agency_workspace_id <> 'b2770000-0000-4000-8000-000000000010') then raise exception 'North member RLS leaked'; end if;
  begin
    perform public.agency_prospect_capture('b2770000-0000-4000-8000-000000000011','monitor','forged','','forged@prospect.test',null,'Forged',20,'F');
    raise exception 'authenticated caller forged acquisition';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','b2770000-0000-4000-8000-000000000002',false);
do $$ begin
  if (select count(*) from public.prospects) <> 1 or exists(select 1 from public.prospects where agency_workspace_id <> 'b2770000-0000-4000-8000-000000000011') then raise exception 'South owner RLS leaked'; end if;
end $$;
select set_config('request.jwt.claim.sub','b2770000-0000-4000-8000-000000000003',false);
do $$ begin if exists(select 1 from public.prospects) then raise exception 'outsider read prospects'; end if; end $$;
reset role;
delete from public.workspace_memberships where user_id='b2770000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','b2770000-0000-4000-8000-000000000001',false);
do $$ begin if exists(select 1 from public.prospects) then raise exception 'revoked member read prospects'; end if; end $$;
reset role;
update public.agency_prospecting_profiles set enabled=false where slug='northside';
do $$ begin
  if exists(select 1 from public.agency_prospecting_profile('northside')) then raise exception 'disabled profile resolved'; end if;
end $$;
