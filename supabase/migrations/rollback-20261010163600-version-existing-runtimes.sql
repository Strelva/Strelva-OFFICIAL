begin;
drop function public.read_version_attachment_choices(uuid,uuid,uuid,text);
drop function public.attach_version_existing_system(uuid,uuid,uuid,text,uuid,uuid,jsonb);
drop table public.system_version_attachment_commands;
drop function public.read_version_existing_runtime(uuid,uuid,text,uuid);
commit;
