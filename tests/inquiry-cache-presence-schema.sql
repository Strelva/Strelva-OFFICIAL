begin;
insert into public.tenants(id,site_name) values ('presence-fixture','Presence fixture'),('presence-other','Other');
insert into public.tenant_leads(tenant_stable_id,tenant_slug_at_capture,lead_id,submission_hash,name,captured_at,intake_state,recorded_via)
select stable_id,id,'lead_held','presencehash','Dana','2026-10-01','held_as_spam','dual_write' from public.tenants where id='presence-fixture';
do $$ begin
  if public.read_tenant_lead_presence('presence-fixture',array['lead_held','lead_pending']) <> '["lead_held"]'::jsonb then raise exception 'held presence lost'; end if;
  if public.read_tenant_lead_presence('presence-other',array['lead_held']) <> '[]'::jsonb then raise exception 'cross tenant presence'; end if;
  if has_function_privilege('authenticated','public.read_tenant_lead_presence(text,text[])','execute') then raise exception 'presence privilege'; end if;
end $$;
rollback;
