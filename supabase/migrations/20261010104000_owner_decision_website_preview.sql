-- Read-only website preview for a signed owner decision. No service session,
-- membership, decision claim, provider action or delivery record is written.
begin;
set local lock_timeout = '3s';
create function public.read_owner_decision_website_preview(p_workspace_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare item public.owner_decisions; recipient jsonb; work public.saved_product_work;
  head public.website_document_heads; document public.website_documents;
begin
  select * into item from public.owner_decisions where workspace_id=p_workspace_id and id=p_decision_id;
  if not found or item.state<>'open' or item.expires_at<=clock_timestamp() or item.route<>'owner_decides'
    or item.sign_in_required or item.change_kind in ('access.grant','money','exit')
    or item.source_lifecycle<>'website_document' or item.revision_hash is distinct from p_revision_hash then
    raise exception 'owner_preview_unavailable';
  end if;
  recipient:=public.resolve_business_owner_recipient(p_workspace_id);
  if recipient is null or nullif(lower(btrim(p_recipient)),'') is null
    or lower(btrim(recipient->>'email')) is distinct from lower(btrim(p_recipient))
    or not public.strelva_runs_business(p_workspace_id) then raise exception 'owner_preview_unavailable'; end if;
  select * into work from public.saved_product_work where workspace_id=p_workspace_id and id::text=split_part(item.source_id,':',1)
    and product_id='websites' and payload->>'version'='2';
  if not found then raise exception 'owner_preview_unavailable'; end if;
  select * into head from public.website_document_heads where workspace_id=p_workspace_id and website_work_id=work.id;
  if not found then raise exception 'owner_preview_unavailable'; end if;
  select * into document from public.website_documents where workspace_id=p_workspace_id and website_work_id=work.id and revision=head.revision;
  if not found or work.payload->'candidate'->>'revision' is distinct from head.revision::text
    or work.payload->'candidate'->>'contentHash' is distinct from document.content_hash
    or work.payload->'candidate'->'document' is distinct from document.document then raise exception 'owner_preview_unavailable'; end if;
  -- The HTTP reader additionally hashes the current lifecycle stage and work
  -- revision against the signed item, and refuses any changed source before rendering.
  return jsonb_build_object('item',public.owner_decision_json(item),
    'record',jsonb_build_object('workId',work.id,'workspaceId',p_workspace_id,'rebuild',work.payload));
end $$;
revoke all on function public.read_owner_decision_website_preview(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.read_owner_decision_website_preview(uuid,uuid,text,text) to service_role;
commit;
