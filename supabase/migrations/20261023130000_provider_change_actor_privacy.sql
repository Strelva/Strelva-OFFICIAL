-- Agency-visible requester presentation is not owner-controlled contact sharing.
-- No approved action-time display name was retained by this request contract.
-- Preserve the scoped read and summaries; historical identity stays neutral.
begin;
create or replace function public.read_provider_change_requests(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare requests jsonb;
begin
 requests := public.read_provider_change_requests_before_coherence(p_workspace_id,p_user_id,p_verified_email);
 return coalesce((select jsonb_agg(item || jsonb_build_object(
   'business_name',b.name,'outgoing_agency_name',outgoing.name,'incoming_agency_name',incoming.name,
   'requested_by_name','Actor not recorded',
   'completed_at',case when item->>'status'='completed' then ended.created_at else null end,
   'summary',jsonb_build_array(
     jsonb_build_object('label','Business workspace','detail','The recorded business is ' || coalesce(b.name,'name unavailable') || '. The agency change refers to this same workspace.','verified',true),
     jsonb_build_object('label','Outgoing agency access','detail',case when p.status='ended' then 'The outgoing agency relationship is recorded as ended.' else 'The outgoing agency relationship is still recorded as active. Independent grants must be reviewed separately.' end,'verified',p.id is not null),
     jsonb_build_object('label','Source definitions','detail',case when h.id is not null then jsonb_array_length(h.definitions)::text || ' agency source revisions were recorded in the immutable handoff snapshot.' else 'No agency source snapshot has been recorded for this relationship.' end,'verified',true),
     jsonb_build_object('label','System and History retention','detail','Retention and native publication behavior have not been verified for this handoff.','verified',false),
     jsonb_build_object('label','Source updates and royalties','detail','Freezing, future update eligibility and royalty rules have not been verified. Creator attribution is not evidence of those terms.','verified',false),
     jsonb_build_object('label','Open Requests','detail','Outstanding Requests and responsibility transfers have not been verified for this handoff.','verified',false)
   )) order by position)
 from jsonb_array_elements(requests) with ordinality rows(item,position)
 left join public.workspaces b on b.id=(item->>'business_workspace_id')::uuid
 left join public.workspace_providers p on p.id=(item->>'old_provider_id')::uuid
 left join public.workspaces outgoing on outgoing.id=p.provider_workspace_id
 left join public.workspaces incoming on incoming.id=(item->>'new_agency_workspace_id')::uuid
 left join public.agency_handoff_receipts ended on ended.reference_id=p.id and ended.kind='provider_ended' and ended.agency_workspace_id=p.provider_workspace_id
 left join public.agency_package_handoffs h on h.provider_id=p.id),'[]'::jsonb);
end $$;
revoke all on function public.read_provider_change_requests(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_provider_change_requests(uuid,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
