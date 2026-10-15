begin;
set local lock_timeout='3s';
drop function public.record_connected_site_check(uuid, uuid, text, uuid, text, text, text[]);
do $$ declare saved text; begin
 select before_definition into saved from keep_your_site_rollback.functions where signature='public.connected_site_json(public.connected_sites,boolean)';
 if saved is null then raise exception 'keep_your_site_rollback_missing_definition'; end if;
 execute saved;
end $$;
alter table public.connected_sites
 drop column last_checked_at, drop column last_check_result, drop column detected_platform,
 drop column detected_evidence, drop column detected_at;
drop schema keep_your_site_rollback cascade;
notify pgrst,'reload schema';
commit;
