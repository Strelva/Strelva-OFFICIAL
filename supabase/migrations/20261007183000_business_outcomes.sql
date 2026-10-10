-- Money and the client's data, part (d): the outcome loop, per business, per month.
--
-- site -> inquiry -> reply -> booking -> review, read from Postgres only.
-- Every figure says whether it is `counted` (rows of one kind in the month)
-- or `linked` (a join between two kinds). A linked figure is only returned
-- where the join exists in data; otherwise it is null with the reason, and
-- the report shows the plain count. Nothing is inferred.
--
-- Joins:
--   inquiry -> first reply  tenant_client_records(store 'inquiry_reply').record_id = tenant_leads.lead_id
--                           (the first message to the customer accepted by the provider)
--   inquiry -> booking      public_website_bookings.inquiry_id = tenant_leads.lead_id (native bookings), and
--                           legacy `bookings`.client_email = an earlier tenant_leads.email of the same business
--   visits                  site_metrics rows with metric 'page_view' or 'visit', when a site records them;
--                           GA4 visits are not stored in Postgres, so visits are otherwise unavailable.
-- Reviews are counted by their review date (else when Strelva saw them).

create function public.business_outcome_month(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_month date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_tenants uuid[];
  v_slugs text[];
  v_inquiries integer := 0;
  v_answered integer := 0;
  v_answered_day integer := 0;
  v_replies_known boolean := false;
  v_native integer := 0;
  v_native_linked integer := 0;
  v_legacy integer := 0;
  v_legacy_linked integer := 0;
  v_legacy_exists boolean := to_regclass('public.bookings') is not null;
  v_reviews integer;
  v_visits integer;
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_workspace_id;
  if not found then raise exception 'business_outcome_denied'; end if;
  if p_month is null then raise exception 'business_outcome_invalid'; end if;
  v_from := date_trunc('month', p_month::timestamp) at time zone 'UTC';
  v_to := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'UTC';
  select coalesce(array_agg(t.stable_id), '{}'), coalesce(array_agg(t.id), '{}') into v_tenants, v_slugs
    from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id where l.workspace_id = p_workspace_id;

  if to_regclass('public.tenant_leads') is not null then
    execute 'select count(*) from public.tenant_leads where tenant_stable_id = any($1) and captured_at >= $2 and captured_at < $3'
      into v_inquiries using v_tenants, v_from, v_to;
    if to_regclass('public.tenant_client_records') is not null then
      execute $q$select count(*) > 0 from public.tenant_client_records where tenant_stable_id = any($1) and store = 'inquiry_reply'$q$
        into v_replies_known using v_tenants;
      execute $q$select count(*), count(*) filter (where (r.payload->>'firstReplyAt')::timestamptz <= l.captured_at + interval '1 day')
        from public.tenant_leads l join public.tenant_client_records r on r.tenant_stable_id = l.tenant_stable_id
          and r.store = 'inquiry_reply' and r.record_id = l.lead_id and r.removed_at is null
        where l.tenant_stable_id = any($1) and l.captured_at >= $2 and l.captured_at < $3$q$
        into v_answered, v_answered_day using v_tenants, v_from, v_to;
    end if;
  end if;

  if to_regclass('public.public_website_bookings') is not null then
    execute $q$select count(*), count(*) filter (where exists (select 1 from public.tenant_leads l
        where l.tenant_stable_id = b.tenant_stable_id and l.lead_id = b.inquiry_id))
      from public.public_website_bookings b where b.business_workspace_id = $1 and b.status <> 'cancelled'
        and b.start_at >= $2 and b.start_at < $3$q$
      into v_native, v_native_linked using p_workspace_id, v_from, v_to;
  end if;
  if v_legacy_exists then
    execute $q$select count(*), count(*) filter (where exists (select 1 from public.tenant_leads l
        join public.tenants t2 on t2.stable_id = l.tenant_stable_id
        where t2.id = any($1) and lower(l.email) = lower(b.client_email) and l.captured_at <= b.created_at))
      from public.bookings b where b.tenant_id = any($1) and coalesce(b.status, '') <> 'cancelled'
        and b.created_at >= $2 and b.created_at < $3$q$
      into v_legacy, v_legacy_linked using v_slugs, v_from, v_to;
  end if;
  if to_regclass('public.reviews') is not null then
    execute 'select count(*) from public.reviews where tenant_id = any($1) and coalesce(review_date, created_at) >= $2 and coalesce(review_date, created_at) < $3'
      into v_reviews using v_slugs, v_from, v_to;
  end if;
  if to_regclass('public.site_metrics') is not null then
    execute $q$select sum(count)::integer from public.site_metrics where tenant_id = any($1) and metric in ('page_view','visit')
      and day::date >= $2 and day::date < $3$q$ into v_visits
      using v_slugs, date_trunc('month', p_month::timestamp)::date, (date_trunc('month', p_month::timestamp) + interval '1 month')::date;
  end if;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'month', to_char(v_from at time zone 'UTC', 'YYYY-MM'),
    'sites', array_length(v_slugs, 1),
    'visits', jsonb_build_object('kind', 'counted', 'value', v_visits,
      'reason', case when v_visits is null then 'Visits are not stored per business in Postgres (GA4 is read live).' end),
    'inquiries', jsonb_build_object('kind', 'counted', 'value', v_inquiries),
    'answered', jsonb_build_object('kind', 'linked',
      'value', case when v_replies_known then v_answered end,
      'withinDay', case when v_replies_known then v_answered_day end,
      'reason', case when not v_replies_known then 'No first-reply times are recorded for these sites yet.' end),
    'bookings', jsonb_build_object('kind', 'counted', 'value', v_native + v_legacy,
      'native', v_native, 'legacy', case when v_legacy_exists then v_legacy end),
    'bookingsFromInquiry', jsonb_build_object('kind', 'linked',
      'value', case when v_native + v_legacy > 0 then v_native_linked + v_legacy_linked end,
      'joins', jsonb_build_array('public_website_bookings.inquiry_id = lead id', 'bookings.client_email = earlier lead email'),
      'reason', case when v_native + v_legacy = 0 then 'No bookings this month.' end),
    'reviews', jsonb_build_object('kind', 'counted', 'value', v_reviews,
      'reason', case when v_reviews is null then 'Reviews are not stored for these sites.' end));
end;
$$;

revoke all on function public.business_outcome_month(uuid, uuid, text, date) from public, anon, authenticated;
grant execute on function public.business_outcome_month(uuid, uuid, text, date) to service_role;
