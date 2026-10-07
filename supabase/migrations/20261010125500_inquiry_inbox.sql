-- New paged inbox. Existing reads stay untouched with the rollout off.
set local lock_timeout = '3s';
create function public.read_workspace_inquiry_inbox_page(p_workspace_id uuid,p_user_id uuid,p_verified_email text,
 p_states text[],p_limit integer,p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_states text[] := coalesce(p_states,array['kept','released']);
begin
 perform public.inquiry_assert_member(p_workspace_id,p_user_id,p_verified_email);
 if not(v_states <@ array['kept','released','held_as_spam','confirmed_spam']) then raise exception 'inquiry_record_invalid'; end if;
 return coalesce((select jsonb_agg(public.inquiry_lead_json(l) || jsonb_build_object('reply',(
  select jsonb_build_object('status',m.status,'providerMessageId',m.provider_message_id,'acceptedAt',m.accepted_at)
  from public.inquiry_workspace_messages m where m.lead_row_id=l.id order by m.created_at desc limit 1)) order by l.captured_at desc,l.id desc)
 from (select * from public.tenant_leads lead where workspace_id=p_workspace_id and intake_state=any(v_states)
   and (tenant_stable_id is null or exists(select 1 from public.memberships membership where membership.user_id=p_user_id and membership.tenant_stable_id=lead.tenant_stable_id))
   and (p_before is null or captured_at<p_before or (captured_at=p_before and p_before_id is not null and id<p_before_id))
   order by captured_at desc,id desc limit least(greatest(coalesce(p_limit,100),1),500)) l),'[]'::jsonb);
end $$;
revoke all on function public.read_workspace_inquiry_inbox_page(uuid,uuid,text,text[],integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.read_workspace_inquiry_inbox_page(uuid,uuid,text,text[],integer,timestamptz,uuid) to service_role;
-- Owner decisions must carry the exact reviewed text, not a clipped commitment.
alter table public.owner_decisions drop constraint owner_decisions_detail_check;
alter table public.owner_decisions add constraint owner_decisions_detail_check check(detail is null or char_length(detail)<=8000) not valid;
alter table public.owner_decisions validate constraint owner_decisions_detail_check;
