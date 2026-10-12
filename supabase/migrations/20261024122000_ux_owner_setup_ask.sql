-- Keep a direct owner's setup brief in their own Ask conversation, in the
-- same transaction as ownership and its idempotency receipt. No agency job,
-- generation, acceptance, outside write or model call is created here.
begin;
set local lock_timeout = '5s';
alter table public.workspace_creation_receipts add column ask_conversation_id uuid
  references public.ask_conversations(id) on delete restrict;
alter function public.enter_customer_business(uuid,text,text,uuid,text,uuid,text)
  rename to enter_customer_business_before_ux_owner;
revoke all on function public.enter_customer_business_before_ux_owner(uuid,text,text,uuid,text,uuid,text)
  from public,anon,authenticated,service_role;
create function public.enter_customer_business(
  p_user_id uuid, p_verified_email text, p_name text, p_business_id uuid,
  p_request_text text, p_command_id uuid, p_command_digest text
) returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare result jsonb; conversation_id uuid; appended jsonb;
begin
  result := public.enter_customer_business_before_ux_owner(p_user_id,p_verified_email,p_name,p_business_id,
    p_request_text,p_command_id,p_command_digest);
  select ask_conversation_id into conversation_id from public.workspace_creation_receipts
    where user_id=p_user_id and command_id=p_command_id for update;
  if p_request_text is not null and result->>'requestId' is null and conversation_id is null then
    appended := public.append_ask_message((result->>'workspaceId')::uuid,p_user_id,p_verified_email,
      null,null,'user',btrim(p_request_text),null,null);
    conversation_id := (appended->>'conversationId')::uuid;
    update public.workspace_creation_receipts set ask_conversation_id=conversation_id
      where user_id=p_user_id and command_id=p_command_id;
  end if;
  return result || jsonb_build_object('askConversationId',conversation_id);
end; $$;
revoke all on function public.enter_customer_business(uuid,text,text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.enter_customer_business(uuid,text,text,uuid,text,uuid,text) to service_role;
commit;
