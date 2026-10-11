\set ON_ERROR_STOP on
begin;
create function pg_temp.be_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'booking email assertion: %',label; end if; end; $$;
create function pg_temp.be_expect(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm not like expected then raise exception 'expected % got %',expected,sqlerrm; end if; return; end; raise exception 'expected %',expected; end; $$;
insert into public.users(id,email,verified_at) values
 ('af200000-0000-4000-8000-000000000001','booking-operator@example.test',now()),
 ('af200000-0000-4000-8000-000000000002','booking-owner@example.test',now());
insert into public.super_admins(user_id,email) values('af200000-0000-4000-8000-000000000001','booking-operator@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('af200000-0000-4000-8000-000000000010','customer','Native Bookings','af200000-0000-4000-8000-000000000002'),
 ('af200000-0000-4000-8000-000000000011','customer','Other Business','af200000-0000-4000-8000-000000000002');
select pg_temp.be_assert(public.read_business_booking_email('af200000-0000-4000-8000-000000000010')='inherit','native business starts unarmed');
select pg_temp.be_assert(not has_table_privilege('service_role','public.business_booking_email_settings','insert') and not has_function_privilege('authenticated','public.set_business_booking_email(uuid,uuid,text,text,text)','execute'),'RPC-only switch');
select pg_temp.be_expect($$select public.set_business_booking_email('af200000-0000-4000-8000-000000000010','af200000-0000-4000-8000-000000000002','booking-owner@example.test','on','Not operator')$$,'operator_queue_access_denied');
select pg_temp.be_expect($$select public.set_business_booking_email('af200000-0000-4000-8000-000000000010','af200000-0000-4000-8000-000000000001','forged@example.test','on','Forged actor')$$,'operator_queue_access_denied');
select pg_temp.be_expect($$select public.set_business_booking_email('af200000-0000-4000-8000-000000000010','af200000-0000-4000-8000-000000000001','booking-operator@example.test','on','')$$,'booking_email_setting_invalid');
select public.set_business_booking_email('af200000-0000-4000-8000-000000000010','af200000-0000-4000-8000-000000000001','booking-operator@example.test','on','Fictional business deliberately armed');
select pg_temp.be_assert(public.read_business_booking_email('af200000-0000-4000-8000-000000000010')='on' and public.read_business_booking_email('af200000-0000-4000-8000-000000000011')='inherit','only selected business armed');
select pg_temp.be_assert((select count(*)=1 and bool_and(actor_id='af200000-0000-4000-8000-000000000001' and before_state='inherit' and state='on') from public.business_booking_email_events where workspace_id='af200000-0000-4000-8000-000000000010'),'actor and prior state recorded');
select public.set_business_booking_email('af200000-0000-4000-8000-000000000010','af200000-0000-4000-8000-000000000001','booking-operator@example.test','off','Stop fictional delivery');
select pg_temp.be_assert(public.read_business_booking_email('af200000-0000-4000-8000-000000000010')='off','kill switch');
select public.set_business_booking_email('af200000-0000-4000-8000-000000000010','af200000-0000-4000-8000-000000000001','booking-operator@example.test','inherit','Return to safe default');
select pg_temp.be_assert(public.read_business_booking_email('af200000-0000-4000-8000-000000000010')='inherit','inherit remains unarmed');
select pg_temp.be_assert(jsonb_array_length(public.read_business_booking_email_history('af200000-0000-4000-8000-000000000010','af200000-0000-4000-8000-000000000001','booking-operator@example.test'))=3,'logged enable disable reset');
select pg_temp.be_expect($$delete from public.business_booking_email_events where workspace_id='af200000-0000-4000-8000-000000000010'$$,'booking_email_event_immutable');
update public.super_admins set revoked_at=now() where user_id='af200000-0000-4000-8000-000000000001';
select pg_temp.be_expect($$select public.set_business_booking_email('af200000-0000-4000-8000-000000000010','af200000-0000-4000-8000-000000000001','booking-operator@example.test','on','Revoked')$$,'operator_queue_access_denied');
rollback;
