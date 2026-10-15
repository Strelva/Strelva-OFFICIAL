-- A retained attempt makes the inverse refuse. Fictional local runner data only.
insert into public.users(id,email,verified_at) values('ec110000-0000-4000-8000-000000000091','rollback@north.example',now());
insert into public.workspaces(id,kind,name,created_by) values('ec110000-0000-4000-8000-000000000092','agency','North Studio rollback fixture','ec110000-0000-4000-8000-000000000091');
insert into public.conn_google_agency_oauth_attempts(id,workspace_id,agency_workspace_id,requested_by,account_id,location_id,nonce_hash,state_hash,expected_locations,status)
 values('ec110000-0000-4000-8000-000000000093','ec110000-0000-4000-8000-000000000092','ec110000-0000-4000-8000-000000000092','ec110000-0000-4000-8000-000000000091','accounts/north','harbor',repeat('a',64),repeat('b',64),'[]','finished');
