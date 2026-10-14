set local lock_timeout = '3s';
-- Preserve delivery receipts; rolling back the code cannot erase acceptance.
do $$ begin
  if exists(select 1 from public.agency_client_owner_claims where delivery->>'status' in ('sending','accepted','unknown')) then
    raise exception 'agency_claim_delivery_receipts_retained';
  end if;
end $$;
drop function public.record_agency_owner_claim_email(uuid,text,uuid,uuid,text,jsonb);
drop function public.prepare_agency_owner_claim_email(uuid,text,uuid,uuid,text);
