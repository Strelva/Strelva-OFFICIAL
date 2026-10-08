-- Connected-site inquiries use the shared durable review/contact/event record only
-- through new v2 RPCs, selected by STRELVA_INQUIRY_RECORDS=1. Old connected
-- capture, spam-pit and inbox RPCs are unchanged while the flag is off.
begin;
set local lock_timeout = '3s';

alter table public.inquiry_events add column connected_site_id uuid;
alter table public.inquiry_events alter column tenant_stable_id drop not null;
alter table public.inquiry_events add constraint inquiry_events_one_origin
  check (num_nonnulls(tenant_stable_id, connected_site_id) = 1) not valid;
alter table public.inquiry_events validate constraint inquiry_events_one_origin;
create unique index inquiry_events_connected_dedupe_idx on public.inquiry_events(connected_site_id, lead_id, dedupe_key)
  where connected_site_id is not null and dedupe_key is not null;
create index inquiry_events_connected_lead_idx on public.inquiry_events(connected_site_id, lead_id, at, id)
  where connected_site_id is not null;

-- Internal source-aware event helper; evidence retains the site identity even
-- if that connection is subsequently removed. No grants to service_role.
create function public.inquiry_lead_event_write(p_lead public.tenant_leads, p_kind text, p_actor text,
  p_actor_id text, p_detail jsonb, p_dedupe text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_lead.connected_site_id is null then
    return public.inquiry_event_write(p_lead.tenant_stable_id, p_lead.workspace_id, p_lead.lead_id,
      p_kind, p_actor, p_actor_id, p_detail, p_dedupe);
  end if;
  insert into public.inquiry_events(connected_site_id, workspace_id, lead_id, kind, actor, actor_id, detail, dedupe_key)
  values (p_lead.connected_site_id, p_lead.workspace_id, p_lead.lead_id, p_kind, p_actor, p_actor_id, coalesce(p_detail, '{}'::jsonb), p_dedupe)
  on conflict (connected_site_id, lead_id, dedupe_key) where connected_site_id is not null and dedupe_key is not null do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

create function public.after_connected_lead_capture(p_lead_row_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lead public.tenant_leads%rowtype;
  v_email text;
  v_phone text;
  v_key text;
  v_contact uuid;
  v_outcome text := 'none';
  v_name text;
begin
  select * into v_lead from public.tenant_leads where id = p_lead_row_id and connected_site_id is not null for update;
  if not found then return jsonb_build_object('status', 'missing', 'contactId', null, 'contact', 'none'); end if;
  if v_lead.intake_state in ('held_as_spam', 'confirmed_spam') then
    -- Spam never becomes a contact.
    return jsonb_build_object('status', 'recorded', 'contactId', null, 'contact', 'none');
  end if;
  perform public.inquiry_lead_event_write(v_lead, 'captured', 'visitor', null,
    jsonb_strip_nulls(jsonb_build_object('source', v_lead.source, 'capabilityId', v_lead.capability_id)), 'captured');

  if v_lead.contact_id is not null then
    return jsonb_build_object('status', 'recorded', 'contactId', v_lead.contact_id, 'contact', 'none');
  end if;
  if v_lead.workspace_id is null
    or not exists (select 1 from public.business_records r where r.workspace_id = v_lead.workspace_id) then
    return jsonb_build_object('status', 'recorded', 'contactId', null, 'contact', 'none');
  end if;

  v_email := lower(nullif(btrim(coalesce(v_lead.email, '')), ''));
  if v_email is not null and not public.business_record_email_valid(v_email) then v_email := null; end if;
  v_phone := nullif(btrim(coalesce(v_lead.fields->>'phone', v_lead.fields->>'tel', '')), '');
  if v_phone is not null and (char_length(v_phone) not between 3 and 40 or public.business_contact_phone_key(v_phone) is null) then
    v_phone := null;
  end if;
  v_key := public.business_contact_phone_key(v_phone);
  v_name := left(nullif(btrim(v_lead.name), ''), 160);
  if v_email is null and v_phone is null then
    return jsonb_build_object('status', 'recorded', 'contactId', null, 'contact', 'skipped');
  end if;

  begin
    if v_email is not null then
      select id into v_contact from public.business_contacts where workspace_id = v_lead.workspace_id and email = v_email for update;
    end if;
    if v_contact is null and v_key is not null then
      select id into v_contact from public.business_contacts where workspace_id = v_lead.workspace_id and phone_key = v_key for update;
    end if;
    if v_contact is null then
      insert into public.business_contacts(workspace_id, name, email, phone, sources, first_seen_at, last_seen_at)
        values (v_lead.workspace_id, v_name, v_email, v_phone, array['inquiry'], v_lead.captured_at, v_lead.captured_at)
        returning id into v_contact;
      v_outcome := 'created';
    else
      -- Fill only what is missing; never take an identifier another contact holds.
      update public.business_contacts c set
          name = coalesce(c.name, v_name),
          email = coalesce(c.email, case when v_email is not null and not exists (
            select 1 from public.business_contacts o where o.workspace_id = c.workspace_id and o.email = v_email) then v_email end),
          phone = coalesce(c.phone, case when v_key is not null and not exists (
            select 1 from public.business_contacts o where o.workspace_id = c.workspace_id and o.phone_key = v_key) then v_phone end),
          sources = case when 'inquiry' = any(c.sources) then c.sources else c.sources || array['inquiry'] end,
          first_seen_at = least(c.first_seen_at, v_lead.captured_at),
          last_seen_at = greatest(c.last_seen_at, v_lead.captured_at),
          updated_at = clock_timestamp()
        where c.id = v_contact;
      v_outcome := 'merged';
    end if;
  exception when others then
    -- A contact that can't be matched never loses the lead or its event.
    return jsonb_build_object('status', 'recorded', 'contactId', null, 'contact', 'skipped');
  end;
  update public.tenant_leads set contact_id = v_contact where id = v_lead.id;
  perform public.inquiry_lead_event_write(v_lead, 'contact_linked', 'system', null,
    jsonb_build_object('contactId', v_contact, 'outcome', v_outcome), 'contact_linked');
  return jsonb_build_object('status', 'recorded', 'contactId', v_contact, 'contact', v_outcome);
end;
$$;

-- Keep capture validation, origin verification and deduplication in the original
-- RPC. A replay also repairs a missing contact/event; no customer mail is sent.
create function public.record_connected_site_inquiry_v2(p_public_key text, p_origin text, p_lead jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  v_result := public.record_connected_site_inquiry(p_public_key, p_origin, p_lead);
  perform public.after_connected_lead_capture((v_result->>'id')::uuid);
  return v_result;
end;
$$;

-- The expiring pit is retained as before. Its review record has no expiry and
-- remains independently of pit purging. Spam never becomes a contact until
-- explicitly released. Per-record locking makes concurrent replays a no-op.
create function public.record_connected_site_spam_v2(p_public_key text, p_origin text, p_record_id text,
  p_payload jsonb, p_payload_hash text, p_captured_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb; v_site public.connected_sites; v_lead public.tenant_leads; v_reason text;
begin
  v_result := public.record_connected_site_spam(p_public_key, p_origin, p_record_id, p_payload, p_payload_hash, p_captured_at);
  v_site := public.connected_site_for_write(p_public_key, p_origin);
  if (p_payload ? 'name' and (jsonb_typeof(p_payload->'name') not in ('string', 'null') or char_length(p_payload->>'name') > 200))
    or (p_payload ? 'email' and (jsonb_typeof(p_payload->'email') not in ('string', 'null') or char_length(p_payload->>'email') > 320))
    or (p_payload ? 'message' and (jsonb_typeof(p_payload->'message') not in ('string', 'null') or char_length(p_payload->>'message') > 5000))
    or (p_payload ? 'phone' and (jsonb_typeof(p_payload->'phone') not in ('string', 'null') or char_length(p_payload->>'phone') > 40)) then
    raise exception 'connected_site_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_site.id::text || ':spam:' || p_record_id, 9106));
  select * into v_lead from public.tenant_leads
    where connected_site_id = v_site.id and lead_id = 'lead_spam_' || md5(p_record_id);
  if found then return jsonb_build_object('status', 'exists'); end if;
  v_reason := left(coalesce(nullif(p_payload->>'reason', ''), 'Connected-site spam score: ' || coalesce(p_payload->>'score', 'unknown')), 200);
  insert into public.tenant_leads(connected_site_id, tenant_slug_at_capture, workspace_id, lead_id, submission_hash,
    name, email, message, source, fields, captured_at, recorded_via, intake_state, held_reason, intake_state_at)
  values (v_site.id, v_site.site_host, v_site.business_workspace_id, 'lead_spam_' || md5(p_record_id),
    's' || left(md5(p_record_id),15), coalesce(p_payload->>'name',''), p_payload->>'email', p_payload->>'message',
    'connected-site:spam', jsonb_strip_nulls(jsonb_build_object('phone', p_payload->>'phone', 'page', p_payload->>'path')),
    p_captured_at, 'spam_hold', 'held_as_spam', v_reason, clock_timestamp()) returning * into v_lead;
  perform public.inquiry_lead_event_write(v_lead, 'held_as_spam', 'system', null, jsonb_build_object('reason',v_reason), 'held');
  return jsonb_build_object('status', 'recorded');
exception when check_violation or not_null_violation or invalid_text_representation then
  raise exception 'connected_site_invalid';
end;
$$;

create function public.read_connected_site_inquiries_v2(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  return coalesce((select jsonb_agg(item order by item->>'capturedAt' desc, item->>'id' desc) from (
    select jsonb_build_object('id', l.id, 'siteId', l.connected_site_id, 'siteHost', l.tenant_slug_at_capture, 'leadId', l.lead_id,
      'name', l.name, 'email', l.email, 'message', l.message, 'source', l.source, 'fields', l.fields,
      'capturedAt', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as item
    from public.tenant_leads l join public.connected_sites s on s.id = l.connected_site_id
    where s.business_workspace_id = p_workspace_id and l.workspace_id = p_workspace_id
      and l.intake_state in ('kept', 'released')
    order by l.captured_at desc, l.id desc limit v_limit) page), '[]'::jsonb);
end $$;
create or replace function public.read_workspace_inquiry_events(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_lead_row_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lead public.tenant_leads%rowtype;
begin
  perform public.inquiry_assert_member(p_workspace_id, p_user_id, p_verified_email);
  select * into v_lead from public.tenant_leads where id = p_lead_row_id and workspace_id = p_workspace_id;
  if not found then raise exception 'inquiry_not_found'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'actor', e.actor, 'detail', e.detail,
      'at', to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by e.at, e.id)
    from public.inquiry_events e where e.lead_id = v_lead.lead_id and ((v_lead.tenant_stable_id is not null and e.tenant_stable_id = v_lead.tenant_stable_id)
      or (v_lead.connected_site_id is not null and e.connected_site_id = v_lead.connected_site_id))), '[]'::jsonb);
end;
$$;
create or replace function public.decide_held_workspace_lead(p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_lead_row_id uuid, p_decision text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor text;
  v_role text;
  v_lead public.tenant_leads%rowtype;
  v_to text;
  v_event text;
begin
  if p_decision is null or p_decision not in ('release', 'confirm_spam', 'hold') then raise exception 'inquiry_record_invalid'; end if;
  if p_workspace_id is null or p_user_id is null or p_verified_email is null
    or not exists (select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null) then
    raise exception 'inquiry_access_denied';
  end if;
  select m.role into v_role from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and w.kind = 'customer' for share of m;
  if v_role = 'owner' then
    v_actor := 'owner';
  elsif exists (select 1 from public.super_admins sa where sa.user_id = p_user_id and sa.revoked_at is null) then
    v_actor := 'operator';
  else
    raise exception 'inquiry_access_denied';
  end if;
  select * into v_lead from public.tenant_leads where id = p_lead_row_id for update;
  if not found or v_lead.workspace_id is distinct from p_workspace_id then raise exception 'inquiry_not_found'; end if;
  if v_lead.intake_state = 'kept' then raise exception 'inquiry_not_held'; end if;
  v_to := case p_decision when 'release' then 'released' when 'confirm_spam' then 'confirmed_spam' else 'held_as_spam' end;
  if v_lead.intake_state = v_to then
    return jsonb_build_object('status', 'unchanged', 'lead', public.inquiry_lead_json(v_lead));
  end if;
  update public.tenant_leads set intake_state = v_to, intake_state_at = clock_timestamp()
    where id = v_lead.id returning * into v_lead;
  v_event := case v_to when 'released' then 'released' when 'confirmed_spam' then 'confirmed_spam' else 'reheld' end;
  perform public.inquiry_lead_event_write(v_lead, v_event, v_actor,
    p_user_id::text, '{}'::jsonb, null);
  if v_to = 'released' and v_lead.connected_site_id is not null then
    perform public.after_connected_lead_capture(v_lead.id);
    select * into v_lead from public.tenant_leads where id = v_lead.id;
  end if;
  return jsonb_build_object('status', 'decided', 'lead', public.inquiry_lead_json(v_lead));
end;
$$;

revoke all on function public.inquiry_lead_event_write(public.tenant_leads,text,text,text,jsonb,text),
  public.after_connected_lead_capture(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_connected_site_inquiry_v2(text,text,jsonb),
  public.record_connected_site_spam_v2(text,text,text,jsonb,text,timestamptz),
  public.read_connected_site_inquiries_v2(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.record_connected_site_inquiry_v2(text,text,jsonb),
  public.record_connected_site_spam_v2(text,text,text,jsonb,text,timestamptz),
  public.read_connected_site_inquiries_v2(uuid,uuid,text,integer) to service_role;
commit;
