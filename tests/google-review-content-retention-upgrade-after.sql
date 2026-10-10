\set ON_ERROR_STOP on
-- Apply new1009 between the before/after fixtures in a disposable clone.
do $$ begin
 if not exists(select 1 from public.reviews where tenant_id='google-review-upgrade-fictional' and external_id is null and text='Accepted customer Google-labelled import' and provider_content->>'source'='customer_import' and reply='Customer reply') then raise exception 'supported customer import lost';end if;
 if exists(select 1 from public.reviews where tenant_id='google-review-upgrade-fictional' and (external_id is not null or author='Ambiguous author') and text<>'') then raise exception 'legacy API cache retained';end if;
 if not exists(select 1 from public.reviews where tenant_id='google-review-upgrade-fictional' and reply='Customer API reply' and text='') then raise exception 'customer API reply lost';end if;
 if exists(select 1 from public.unified_events where tenant_id='google-review-upgrade-fictional' and body<>'') then raise exception 'null/scalar API event not purged';end if;
 if exists(select 1 from public.proposals where tenant_id='google-review-upgrade-fictional' and body<>'') then raise exception 'null/scalar API proposal not purged';end if;
end $$;

do $$ begin
 if not exists(select 1 from public.workspace_export_builds where id='91009000-0000-4000-8000-000000000011' and status='ready' and provider_content_expires_at=expires_at and expires_at>clock_timestamp()) then raise exception 'live predecessor archive deadline not backfilled';end if;
 if exists(select 1 from public.workspace_export_build_parts where build_id in ('91009000-0000-4000-8000-000000000012','91009000-0000-4000-8000-000000000013')) then raise exception 'expired or unknown predecessor bytes retained';end if;
 if (select count(*) from public.workspace_export_receipts where id in ('91009000-0000-4000-8000-000000000011','91009000-0000-4000-8000-000000000012','91009000-0000-4000-8000-000000000013','91009000-0000-4000-8000-000000000014'))<>4 then raise exception 'predecessor receipt history lost';end if;
 if (select count(*) from public.workspace_export_builds where id in ('91009000-0000-4000-8000-000000000012','91009000-0000-4000-8000-000000000013') and status='failed' and download_token_hash is null and manifest->>'fixture'='sealed-predecessor')<>2 then raise exception 'expired predecessor request history changed';end if;
 if not exists(select 1 from public.workspace_export_builds where id='91009000-0000-4000-8000-000000000014' and status='ready' and provider_content_expires_at is null) then raise exception 'customer predecessor archive expired';end if;
end $$;

-- Actual service calls under transaction-level READ ONLY, not volatility metadata.
begin read only;
set local role service_role;
do $$ declare token_body text;owner_body text;bid uuid;begin
 token_body:=public.read_workspace_export_build_part('91009000-0000-4000-8000-000000000011',repeat('1',64),0)->>'body';
 owner_body:=public.read_workspace_export_owner_part('91009000-0000-4000-8000-000000000011','91009000-0000-4000-8000-000000000001','review-upgrade-owner@example.test',0)->>'body';
 if token_body is distinct from owner_body or token_body::jsonb#>>'{data,reviews,0,text}'<>'Sealed predecessor review 1' then raise exception 'live sealed predecessor bytes changed';end if;
 if public.read_workspace_export_owner_part('91009000-0000-4000-8000-000000000014','91009000-0000-4000-8000-000000000001','review-upgrade-owner@example.test',0)->>'body' not like '%Sealed predecessor review 4%' then raise exception 'customer predecessor bytes lost';end if;
 begin perform public.read_workspace_export_build_part('91009000-0000-4000-8000-000000000011',repeat('9',64),0);raise exception 'wrong token admitted';exception when others then if sqlerrm<>'workspace_export_link_invalid' then raise;end if;end;
 begin perform public.read_workspace_export_owner_part('91009000-0000-4000-8000-000000000011','91009000-0000-4000-8000-000000000002','review-upgrade-stranger@example.test',0);raise exception 'wrong actor admitted';exception when others then if sqlerrm<>'workspace_export_denied' then raise;end if;end;
 foreach bid in array array['91009000-0000-4000-8000-000000000012'::uuid,'91009000-0000-4000-8000-000000000013'::uuid] loop
  begin perform public.read_workspace_export_build_part(bid,case when bid::text like '%12' then repeat('2',64) else repeat('3',64) end,0);raise exception 'expired predecessor token admitted';exception when others then if sqlerrm<>'workspace_export_link_invalid' then raise;end if;end;
  begin perform public.read_workspace_export_owner_part(bid,'91009000-0000-4000-8000-000000000001','review-upgrade-owner@example.test',0);raise exception 'expired predecessor owner admitted';exception when others then if sqlerrm<>'workspace_export_link_invalid' then raise;end if;end;
 end loop;
 if has_function_privilege(current_user,'public.read_workspace_export_build_part_before_review_retention(uuid,text,integer)','execute') or has_function_privilege(current_user,'public.read_workspace_export_owner_part_before_review_retention(uuid,uuid,text,integer)','execute') or has_function_privilege(current_user,'public.complete_workspace_export_build_before_review_retention(uuid,jsonb,text,jsonb)','execute') then raise exception 'old archive helper exposed';end if;
end $$;
rollback;
-- Revoke only this fictional owner, then exercise the same read-only wrapper.
delete from public.workspace_memberships where workspace_id='91009000-0000-4000-8000-000000000003' and user_id='91009000-0000-4000-8000-000000000001';
begin read only;
set local role service_role;
do $$ begin
 begin perform public.read_workspace_export_owner_part('91009000-0000-4000-8000-000000000011','91009000-0000-4000-8000-000000000001','review-upgrade-owner@example.test',0);raise exception 'revoked owner admitted';exception when others then if sqlerrm<>'workspace_export_denied' then raise;end if;end;
end $$;
rollback;
