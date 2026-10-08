-- OPTIONAL structural completion AFTER the receipt-preserving batch-8 companions.
-- Never run automatically on a live target. Requires explicit recovery authority,
-- all batch-8 callers/gates disabled, and this target's pre/forward captures.
-- Every evidence table must be empty; new fields/flag history must be unused.
-- No row is deleted, archived, rewritten or replayed. A refusal changes nothing.
-- Complete public catalog equality is checked inside the same transaction.
\set ON_ERROR_STOP on
\if :{?batch8_empty_recovery_authorized}
\else
\set batch8_empty_recovery_authorized false
\endif
\if :{?batch8_callers_disabled}
\else
\set batch8_callers_disabled false
\endif
begin;
set local lock_timeout='3s';
set local statement_timeout='120s';
select set_config('release.batch8_empty_recovery_authorized', :'batch8_empty_recovery_authorized',true),
       set_config('release.batch8_callers_disabled', :'batch8_callers_disabled',true);
do $recovery$
declare
  empty_tables constant text[]:=array['business_outcome_report_deliveries','connected_inquiry_owner_notice_repairs','connected_inquiry_owner_notices','inquiry_booking_offers','inquiry_business_fact_proposals','inquiry_decision_notice_claims','inquiry_decision_notice_events','inquiry_engine_reply_claims','inquiry_workspace_message_events','inquiry_workspace_messages','internal_tool_contact_conflicts','newsletter_contact_sync','operator_google_write_attempts','operator_queue_effort_context','owner_decision_link_sessions','system_version_native_applications','tenant_deprovision_retention_receipts','website_cutover_undos','workspace_exit_handoff_receipts','workspace_export_recovery']::text[];
  new_functions constant text[]:=array['after_connected_lead_capture(uuid)','assert_tenant_inquiry_export(text)','authorize_inquiry_owner_link_decision(text,text,text,text)','business_inquiry_outcomes(uuid,uuid,text,timestamp with time zone,timestamp with time zone)','business_inquiry_outcomes_for_tenant(text,timestamp with time zone,timestamp with time zone)','business_outcome_month_inquiries(uuid,uuid,text,date)','choose_inquiry_booking_slot(uuid,integer)','claim_connected_inquiry_owner_notice(uuid,uuid,uuid,text)','claim_connected_inquiry_owner_notice_repair(uuid,text,uuid)','claim_engine_inquiry_reply(text,text,uuid)','claim_inquiry_decision_notice(uuid,uuid,text,text)','claim_workspace_inquiry_reply(uuid,uuid,text,uuid,uuid,text,text,text)','confirm_inquiry_business_fact(uuid,uuid,uuid,text)','correct_inquiry_business_fact(uuid,uuid,text,jsonb)','decide_operator_held_inquiry(uuid,text,uuid,text)','deprovision_tenant_rows_after_inquiry_export(text)','finish_connected_inquiry_owner_notice(uuid,text,text,timestamp with time zone)','finish_connected_inquiry_owner_notice_repair(uuid,text,text,timestamp with time zone)','finish_inquiry_decision_notice(uuid,uuid,text,text,timestamp with time zone,text)','finish_workspace_inquiry_reply(uuid,text,text,timestamp with time zone)','guard_workspace_inquiry_reply_purpose()','inquiry_assert_operator(uuid,text)','inquiry_booking_offer_json(inquiry_booking_offers)','inquiry_booking_witness(text,text)','inquiry_business_fact_revision(uuid,uuid)','inquiry_lead_event_write(tenant_leads,text,text,text,jsonb,text)','inquiry_outcome_cohort(uuid,timestamp with time zone,timestamp with time zone)','inquiry_safe_timestamp(text)','list_connected_inquiry_owner_notices_not_told()','prepare_inquiry_booking_offer(text,text,jsonb,uuid,jsonb,uuid,text)','read_inquiry_booking_handoff(text,text,uuid,uuid,uuid,text)','read_inquiry_booking_offer(uuid)','read_inquiry_business_facts(uuid,uuid)','read_inquiry_workspace_booking_context(uuid)','read_inquiry_workspace_bookings(uuid,date,date)','read_operator_held_inquiries(uuid,text,text,integer,timestamp with time zone,uuid)','read_operator_inquiry_notice_issues(uuid,text,integer,timestamp with time zone,uuid)','read_tenant_lead_presence(text,text[])','read_tenant_lead_summary(text,timestamp with time zone)','read_tenant_leads_page(text,integer,timestamp with time zone,text)','read_workspace_inquiry_inbox_page(uuid,uuid,text,text[],integer,timestamp with time zone,uuid)','read_workspace_inquiry_leads_with_receipts(uuid,uuid,text,text[],integer,timestamp with time zone)','read_workspace_inquiry_reply_receipts(uuid,uuid,text)','record_connected_inquiry_owner_notice_event(uuid,uuid,text,text,text,timestamp with time zone,timestamp with time zone,text[],text)','record_connected_inquiry_owner_notice_repair_event(uuid,uuid,uuid,text,text,text,timestamp with time zone,timestamp with time zone,text[],text)','record_tenant_lead_read_parity(text,integer,integer,integer,integer)','record_workspace_inquiry_booking(uuid,uuid,jsonb,jsonb,text,text)','record_workspace_inquiry_provider_event(uuid,uuid,text,text,text,timestamp with time zone,timestamp with time zone,text[],text)','release_rejected_engine_inquiry_reply(text,text,uuid)','resolve_workspace_inquiry_booking_lead(uuid,uuid,uuid,text)','stage_inquiry_business_fact(uuid,uuid,text,jsonb,text)','tenant_lead_read_parity_streak()','verify_connected_inquiry_owner_notice_repair(uuid)']::text[];
  restored_functions constant text[]:=array['client_record_parity_streak(text)','decide_held_workspace_lead(uuid,uuid,text,uuid,text)','read_workspace_inquiry_events(uuid,uuid,text,uuid)','record_tenant_client_record(text,text,text,jsonb,text,timestamp with time zone,text,text)','resolve_internal_tool_links(uuid,uuid,uuid,text,jsonb)','workspace_export_v3_categories()','workspace_release_flag_names()']::text[];
  empty_columns constant text[]:=array['inquiry_events.connected_site_id','internal_tool_notices.delivery','internal_tool_notices.delivery_lease','internal_tool_notices.delivery_lease_until']::text[];
  restored_constraints constant text[]:=array['inquiry_events.inquiry_events_one_origin','owner_decisions.owner_decisions_detail_check','strelva_service_actions.strelva_service_actions_purpose_check','system_version_overrides.system_version_overrides_path_check','tenant_client_records.tenant_client_records_provider_ciphertext','tenant_client_records.tenant_client_records_store_check']::text[];
  new_indexes constant text[]:=array['inquiry_booking_offers_lead_idx','inquiry_business_fact_one_pending','inquiry_events_connected_dedupe_idx','inquiry_events_connected_lead_idx','inquiry_workspace_message_provider_idx','inquiry_workspace_message_purpose_idx']::text[];
  new_triggers constant text[]:=array['inquiry_decision_notice_events.inquiry_decision_notice_events_immutable','inquiry_workspace_message_events.inquiry_workspace_message_events_immutable','inquiry_workspace_messages.inquiry_workspace_reply_shared_purpose','operator_queue_effort_context.operator_queue_effort_context_append_only','owner_decision_link_sessions.owner_decision_link_sessions_immutable','website_cutover_undos.website_cutover_undos_immutable']::text[];
  capture release_rollback_baseline.batch8_empty_schema%rowtype;
  recovery_catalog jsonb; actual jsonb; prior jsonb; admitted jsonb;
  kind text; object_key text; target text; table_name text; object_name text;
  populated boolean; admissible boolean; exception_hash text; left_to_drop text[]; next_pending text[]; progress integer;
begin
  if current_setting('release.batch8_empty_recovery_authorized',true) is distinct from 'true'
    or current_setting('release.batch8_callers_disabled',true) is distinct from 'true'
    or current_user in ('anon','authenticated','service_role') then
    raise exception 'batch8_empty_recovery_explicit_authority_and_disabled_callers_required';
  end if;
  select * into capture from release_rollback_baseline.batch8_empty_schema where singleton;
  if not found or capture.captured_by<>current_user or capture.forward_catalog is null
    or md5(capture.before_catalog::text)<>capture.before_hash
    or md5(capture.forward_catalog::text)<>capture.forward_hash then
    raise exception 'batch8_empty_recovery_capture_missing_or_drifted';
  end if;
  -- Deterministic exclusive locks exclude new evidence or changed flags racing
  -- the checks. Keep them through final catalog verification and commit.
  for target in select distinct t from unnest(empty_tables||array['inquiry_events','internal_tool_notices',
    'owner_decisions','tenant_client_records','system_version_overrides','strelva_service_actions',
    'workspace_release_flags','workspace_release_flag_changes']) t order by t loop
    if to_regclass(format('public.%I',target)) is null then raise exception 'batch8_empty_recovery_missing_table: %',target; end if;
    execute format('lock table public.%I in access exclusive mode',target);
  end loop;
  -- ALL row checks precede any application object mutation.
  foreach target in array empty_tables loop
    if capture.before_catalog->'tables' ? target then raise exception 'batch8_empty_recovery_table_was_preexisting: %',target; end if;
    execute format('select exists(select 1 from public.%I)',target) into populated;
    if populated then raise exception 'batch8_empty_recovery_retained_evidence: %',target; end if;
  end loop;
  foreach target in array empty_columns loop
    table_name:=split_part(target,'.',1);object_name:=split_part(target,'.',2);
    execute format('select exists(select 1 from public.%I where %I is not null)',table_name,object_name) into populated;
    if populated then raise exception 'batch8_empty_recovery_retained_field: %',target; end if;
  end loop;
  if exists(select 1 from public.workspace_release_flags where not(flag=any(capture.before_flags)))
    or exists(select 1 from public.workspace_release_flag_changes where subject<>'tester' and not(subject=any(capture.before_flags))) then
    raise exception 'batch8_empty_recovery_retained_flag_history';
  end if;
  if exists(select 1 from public.inquiry_events where tenant_stable_id is null) then
    raise exception 'batch8_empty_recovery_retained_connected_inquiry';
  end if;
  recovery_catalog:=release_rollback_baseline.batch8_public_catalog();
  -- Admit only registered residual objects. Baseline or forward fingerprints
  -- guard bodies/structure; explicit hashes name companion-restored variants.
  for kind in select jsonb_object_keys(recovery_catalog) loop
    for object_key,actual in select key,value from jsonb_each(recovery_catalog->kind) loop
      prior:=capture.before_catalog->kind->object_key;
      if actual=prior then continue; end if;
      admitted:=capture.forward_catalog->kind->object_key;
      admissible:=false;
      table_name:=split_part(object_key,'.',1);
      if kind='functions' and object_key=any(new_functions||restored_functions) then
        select h into exception_hash from (values
    ('inquiry_booking_offer_json(inquiry_booking_offers)','1354c9ebb29dca556e1b46e7fc94a1b1'),
    ('prepare_inquiry_booking_offer(text,text,jsonb,uuid,jsonb,uuid,text)','392ada340824b57a0dfb6dbe83c33a97'),
    ('read_inquiry_workspace_booking_context(uuid)','7e9301a195658b73f082150643ff0f43'),
    ('read_workspace_inquiry_inbox_page(uuid,uuid,text,text[],integer,timestamp with time zone,uuid)','72e436cf96805c1dde1df2938b34f573'),
    ('read_workspace_inquiry_leads_with_receipts(uuid,uuid,text,text[],integer,timestamp with time zone)','35a3eee70728130ae0dd48e9a098d113'),
    ('workspace_export_v3_categories()','65692f985c9e8ac73bce186cb54bd887'),
    ('workspace_release_flag_names()','a277b8875ae016b8c7a1d8c94251ab76')
        ) audited(signature,h) where signature=object_key;
        admissible:=actual->>'owner'=admitted->>'owner'
          and (actual->>'def'=admitted->>'def' or actual->>'def'=prior->>'def'
            or md5(actual->>'def')=exception_hash);
        if object_key=any(restored_functions) then
          admissible:=admissible and actual->>'acl'=prior->>'acl';
        elsif exists((select grantor,grantee,privilege_type,is_grantable from aclexplode((actual->>'acl')::aclitem[]))
          except (select grantor,grantee,privilege_type,is_grantable from aclexplode((admitted->>'acl')::aclitem[]))) then
          admissible:=false;
        end if;
      elsif kind='tables' then admissible:=object_key=any(empty_tables) and actual=admitted;
      elsif kind='columns' then
        admissible:=(table_name=any(empty_tables) or object_key=any(empty_columns)
          or object_key='inquiry_events.tenant_stable_id') and actual=admitted;
      elsif kind='constraints' then
        admissible:=(table_name=any(empty_tables) or object_key=any(restored_constraints)) and
          (actual=admitted or (object_key='operator_google_write_attempts.operator_google_write_attempts_write_kind_check' and actual=to_jsonb('CHECK ((write_kind = ANY (ARRAY[''gbp_hours''::text, ''gbp_post''::text, ''gbp_photo''::text])))'::text)));
      elsif kind='indexes' then admissible:=object_key=any(new_indexes) and actual=admitted;
      elsif kind='triggers' then admissible:=object_key=any(new_triggers) and actual=admitted;
      end if;
      if admissible is not true then raise exception 'batch8_empty_recovery_object_drift: %.%',kind,object_key; end if;
    end loop;
    for object_key in select jsonb_object_keys(capture.before_catalog->kind) loop
      if not(recovery_catalog->kind ? object_key) then raise exception 'batch8_empty_recovery_missing_predecessor: %.%',kind,object_key; end if;
    end loop;
  end loop;
  foreach target in array new_triggers loop
    execute format('drop trigger %I on public.%I',split_part(target,'.',2),split_part(target,'.',1));
  end loop;
  foreach target in array restored_functions loop
    execute capture.before_catalog->'functions'->target->>'def';
  end loop;
  foreach target in array restored_constraints loop
    table_name:=split_part(target,'.',1);object_name:=split_part(target,'.',2);
    execute format('alter table public.%I drop constraint %I',table_name,object_name);
    if capture.before_catalog->'constraints' ? target then
      execute format('alter table public.%I add constraint %I %s',table_name,object_name,
        capture.before_catalog->'constraints'->>target);
    end if;
  end loop;
  -- Ordinary non-cascading drops; unknown dependents stop the whole recovery.
  left_to_drop:=new_functions;
  while cardinality(left_to_drop)>0 loop
    next_pending:=array[]::text[];progress:=0;
    foreach target in array left_to_drop loop
      begin
        if to_regprocedure('public.'||target) is null then raise exception 'batch8_empty_recovery_missing_function: %',target; end if;
        execute format('drop function %s',to_regprocedure('public.'||target));progress:=progress+1;
      exception when dependent_objects_still_exist then next_pending:=array_append(next_pending,target);
      end;
    end loop;
    if progress=0 then raise exception 'batch8_empty_recovery_unknown_function_dependents: %',next_pending; end if;
    left_to_drop:=next_pending;
  end loop;
  foreach target in array new_indexes loop execute format('drop index public.%I',target); end loop;
  left_to_drop:=empty_tables;
  while cardinality(left_to_drop)>0 loop
    next_pending:=array[]::text[];progress:=0;
    foreach target in array left_to_drop loop
      begin execute format('drop table public.%I',target);progress:=progress+1;
      exception when dependent_objects_still_exist then next_pending:=array_append(next_pending,target);end;
    end loop;
    if progress=0 then raise exception 'batch8_empty_recovery_unknown_table_dependents: %',next_pending; end if;
    left_to_drop:=next_pending;
  end loop;
  foreach target in array empty_columns loop
    execute format('alter table public.%I drop column %I',split_part(target,'.',1),split_part(target,'.',2));
  end loop;
  alter table public.inquiry_events alter column tenant_stable_id set not null;
  if release_rollback_baseline.batch8_public_catalog()<>capture.before_catalog then
    raise exception 'batch8_empty_recovery_catalog_not_exact';
  end if;
end $recovery$;
commit;
