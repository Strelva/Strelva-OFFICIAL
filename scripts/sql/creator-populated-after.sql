\set ON_ERROR_STOP on
-- New metadata may be present or rolled back; every pre-existing column is exact.
do $$ declare saved record; fingerprint text;begin
 for saved in select * from public.creator_upgrade_snapshots loop
  execute format('select md5(coalesce(string_agg((to_jsonb(t)-array[''creator_workspace_id'',''installed_source_revision_id'',''declaration'',''listing_state''])::text,''|'' order by (to_jsonb(t)-array[''creator_workspace_id'',''installed_source_revision_id'',''declaration'',''listing_state''])::text),'''')) from public.%I t',saved.table_name) into fingerprint;
  if fingerprint<>saved.digest then raise exception 'creator_upgrade_changed_retained_rows: %',saved.table_name;end if;
 end loop;
 for saved in select * from public.creator_upgrade_guard_hashes loop
  if md5(pg_get_functiondef(to_regprocedure(saved.signature)))<>saved.digest then raise exception 'creator_upgrade_changed_guard: %',saved.signature;end if;
 end loop;
 if to_regclass('public.system_revision_qualifications') is not null then
  if exists(select 1 from public.system_revision_qualifications) then raise exception 'creator_upgrade_invented_qualification';end if;
 end if;
 begin update public.system_version_source_revisions set summary=summary||'Changed' where id='bc630000-0000-4000-8000-000000000021';raise exception 'creator_upgrade_guard_not_restored';exception when others then if sqlerrm<>'system_version_history_immutable' then raise;end if;end;
 begin update public.system_version_releases set definition=definition||'{"changed":true}' where version_id in (select id from public.system_versions where business_workspace_id='bc630000-0000-4000-8000-000000000011');raise exception 'creator_upgrade_release_guard_not_restored';exception when others then if sqlerrm<>'system_version_history_immutable' then raise;end if;end;
 raise notice 'Creator populated native upgrade preserved all original row hashes, live pointers, customer records, owner receipts and exact immutable guard definitions';
end $$;
