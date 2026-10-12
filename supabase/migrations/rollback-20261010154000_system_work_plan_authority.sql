begin;
set local lock_timeout = '3s';
drop function if exists public.execute_system_work_plan_output(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,jsonb,jsonb,jsonb);
drop function if exists public.read_system_work_plan_output(uuid,uuid,uuid,text,integer,text,text,text,text);
drop function if exists public.list_system_work_plan_outputs(uuid,uuid,uuid,text);
drop function if exists public.read_system_work_plan(uuid,uuid,text,uuid);
drop function if exists public.save_system_work_plan(uuid,uuid,text,text,jsonb,jsonb);
drop function if exists public.require_system_work_plan_actor(uuid,uuid,text);
commit;
