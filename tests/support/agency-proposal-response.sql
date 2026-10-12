-- Existing contracts run both before and after the AG4 boundary. This fixture
-- helper reviews the current proposal explicitly; product callers never do so.
create or replace function pg_temp.respond_to_agency_proposal(p_user_id uuid,p_verified_email text,p_agency_id uuid,p_business_id uuid,p_accept boolean)
returns jsonb language plpgsql as $$
declare result jsonb; proposal_id text;
begin
  if to_regprocedure('public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean,text)') is not null then
    execute $query$select proposal->>'proposalId' from jsonb_array_elements(public.read_agency_proposals($1,$2,$3)) proposal
      where proposal->>'businessWorkspaceId' = $4::text$query$ into proposal_id
      using p_user_id,p_verified_email,p_agency_id,p_business_id;
    execute 'select public.respond_to_agency_proposal($1,$2,$3,$4,$5,$6)' into result
      using p_user_id,p_verified_email,p_agency_id,p_business_id,p_accept,proposal_id;
  else
    result := public.respond_to_agency_proposal(p_user_id,p_verified_email,p_agency_id,p_business_id,p_accept);
  end if;
  return result;
end;
$$;
