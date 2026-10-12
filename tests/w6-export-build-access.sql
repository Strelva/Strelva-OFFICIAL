\set ON_ERROR_STOP on
begin;
insert into public.users(id,email,verified_at) values
 ('e6590000-0000-4000-8000-000000000001','build-owner@example.test',now()),
 ('e6590000-0000-4000-8000-000000000002','build-operator@example.test',now()),
 ('e6590000-0000-4000-8000-000000000003','build-member@example.test',now()),
 ('e6590000-0000-4000-8000-000000000004','other-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('e6590000-0000-4000-8000-000000000010','customer','Owner archive','e6590000-0000-4000-8000-000000000001'),
 ('e6590000-0000-4000-8000-000000000011','customer','Other business','e6590000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('e6590000-0000-4000-8000-000000000010','e6590000-0000-4000-8000-000000000001','owner','e6590000-0000-4000-8000-000000000001'),
 ('e6590000-0000-4000-8000-000000000010','e6590000-0000-4000-8000-000000000002','admin','e6590000-0000-4000-8000-000000000001'),
 ('e6590000-0000-4000-8000-000000000010','e6590000-0000-4000-8000-000000000003','member','e6590000-0000-4000-8000-000000000001'),
 ('e6590000-0000-4000-8000-000000000011','e6590000-0000-4000-8000-000000000004','owner','e6590000-0000-4000-8000-000000000004');
-- An operator can start it, but only the owner can retrieve its data without a token.
insert into public.workspace_export_builds(id,workspace_id,requested_by,requester_role,deliver_to,status,
 part_count,byte_size,manifest,download_token_hash,expires_at) values
 ('e6590000-0000-4000-8000-000000000020','e6590000-0000-4000-8000-000000000010','e6590000-0000-4000-8000-000000000002','operator','build-owner@example.test','ready',
 2,11,'{"included":[]}',repeat('a',64),now()+interval '7 days'),
 ('e6590000-0000-4000-8000-000000000021','e6590000-0000-4000-8000-000000000010','e6590000-0000-4000-8000-000000000001','owner','build-owner@example.test','building',
 0,0,null,null,null);
insert into public.workspace_export_build_parts(build_id,part,body) values
 ('e6590000-0000-4000-8000-000000000020',0,'first'),('e6590000-0000-4000-8000-000000000020',1,'second');
do $$declare result jsonb; actor record;begin
  result:=public.read_workspace_export_owner_status('e6590000-0000-4000-8000-000000000020','e6590000-0000-4000-8000-000000000001','build-owner@example.test');
  if result->>'status'<>'ready' or (result->>'expired')::boolean or result ? 'downloadTokenHash' then raise exception 'owner status invalid';end if;
  result:=public.read_workspace_export_owner_part('e6590000-0000-4000-8000-000000000020','e6590000-0000-4000-8000-000000000001','build-owner@example.test',1);
  if result->>'body'<>'second' or (result->>'partCount')::int<>2 then raise exception 'owner part missing';end if;
  for actor in select id,email from public.users where id in ('e6590000-0000-4000-8000-000000000002','e6590000-0000-4000-8000-000000000003','e6590000-0000-4000-8000-000000000004') loop
    begin
      perform public.read_workspace_export_owner_status('e6590000-0000-4000-8000-000000000020',actor.id,actor.email);
      raise exception 'non-owner read status';
    exception when others then if sqlerrm<>'workspace_export_denied' then raise;end if;end;
    begin
      perform public.read_workspace_export_owner_part('e6590000-0000-4000-8000-000000000020',actor.id,actor.email,0);
      raise exception 'non-owner downloaded';
    exception when others then if sqlerrm<>'workspace_export_denied' then raise;end if;end;
  end loop;
  begin
    perform public.read_workspace_export_owner_part('e6590000-0000-4000-8000-000000000021','e6590000-0000-4000-8000-000000000001','build-owner@example.test',0);
    raise exception 'unfinished download';
  exception when others then if sqlerrm<>'workspace_export_link_invalid' then raise;end if;end;
  begin
    perform public.read_workspace_export_owner_part('e6590000-0000-4000-8000-000000000020','e6590000-0000-4000-8000-000000000001','build-owner@example.test',2);
    raise exception 'missing part download';
  exception when others then if sqlerrm<>'workspace_export_link_invalid' then raise;end if;end;
  begin
    perform public.read_workspace_export_owner_status('e6590000-0000-4000-8000-000000000020','e6590000-0000-4000-8000-000000000001','spoof@example.test');
    raise exception 'email spoof';
  exception when others then if sqlerrm<>'workspace_export_denied' then raise;end if;end;
  if has_function_privilege('anon','public.read_workspace_export_owner_part(uuid,uuid,text,integer)','execute')
    or has_function_privilege('authenticated','public.read_workspace_export_owner_status(uuid,uuid,text)','execute') then raise exception 'public archive access';end if;
end $$;
update public.workspace_export_builds set expires_at=now()-interval '1 second' where id='e6590000-0000-4000-8000-000000000020';
do $$begin
  if public.read_workspace_export_owner_status('e6590000-0000-4000-8000-000000000020','e6590000-0000-4000-8000-000000000001','build-owner@example.test')->>'status'<>'expired' then raise exception 'expiry missing';end if;
  begin
    perform public.read_workspace_export_owner_part('e6590000-0000-4000-8000-000000000020','e6590000-0000-4000-8000-000000000001','build-owner@example.test',0);
    raise exception 'expired download';
  exception when others then if sqlerrm<>'workspace_export_link_invalid' then raise;end if;end;
end $$;
update public.workspace_export_builds set created_at=now()-interval '31 minutes' where id='e6590000-0000-4000-8000-000000000021';
do $$begin
  if public.read_workspace_export_owner_status('e6590000-0000-4000-8000-000000000021','e6590000-0000-4000-8000-000000000001','build-owner@example.test')->>'status'<>'stalled' then raise exception 'stalled job not retryable';end if;
end $$;
update public.workspace_export_builds set status='failed',failure='safe_failure_code' where id='e6590000-0000-4000-8000-000000000021';
do $$begin
  if public.read_workspace_export_owner_status('e6590000-0000-4000-8000-000000000021','e6590000-0000-4000-8000-000000000001','build-owner@example.test')->>'status'<>'failed' then raise exception 'failure status missing';end if;
end $$;
-- Authorization is current, even if this owner initiated the original build.
update public.workspace_memberships set role='member' where workspace_id='e6590000-0000-4000-8000-000000000010' and user_id='e6590000-0000-4000-8000-000000000001';
do $$begin
  begin
    perform public.read_workspace_export_owner_status('e6590000-0000-4000-8000-000000000020','e6590000-0000-4000-8000-000000000001','build-owner@example.test');
    raise exception 'revoked owner read status';
  exception when others then if sqlerrm<>'workspace_export_denied' then raise;end if;end;
end $$;
rollback;
