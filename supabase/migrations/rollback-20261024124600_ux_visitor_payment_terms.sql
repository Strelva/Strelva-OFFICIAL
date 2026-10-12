-- Restore the prior public projection; issued payment terms remain immutable.
-- Payment acceptance, amounts, authority and provider writes are unchanged.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create or replace function public.read_public_payment_request(p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r public.business_payment_requests%rowtype;paid boolean;begin
 select * into r from public.business_payment_requests where token_hash=p_hash;
 if r.id is null then raise exception 'payment_request_not_found';end if;
 select exists(select 1 from public.business_payments p join public.business_payment_events e on e.payment_id=p.id and e.kind='paid' where p.workspace_id=r.workspace_id and p.reference_id=r.id::text) into paid;
 return jsonb_build_object('id',r.id,'workspaceId',r.workspace_id,'businessName',coalesce((select f.value#>>'{}' from public.business_confirmed_facts(r.workspace_id) f where f.fact_key='display_name'),(select w.name from public.workspaces w where w.id=r.workspace_id)),'kind',r.kind,'lines',r.lines,'acceptedTerms',r.accepted_terms,'amountCents',r.amount_cents,'currency',r.currency,'expiresAt',r.expires_at,'paid',paid,'status',case when paid then 'paid' when exists(select 1 from public.payment_request_actions where request_id=r.id and action='cancelled') then 'cancelled' when r.expires_at<=now() then 'expired' else 'unpaid' end);
end;$$;
revoke all on function public.read_public_payment_request(text) from public, anon, authenticated;
grant execute on function public.read_public_payment_request(text) to service_role;
commit;
