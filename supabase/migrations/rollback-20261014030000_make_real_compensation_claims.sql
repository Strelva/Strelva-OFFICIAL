-- Runtime rollback only: preserve accepted effects, claims, history and safety validators.
-- The older runner must not mutate rows containing ambiguous compensation outcomes.
-- Forward reapplication restores service writes; reads and existing evidence remain available.
begin;
set local lock_timeout='3s';
set local statement_timeout='120s';
revoke all on function public.create_make_real_activation(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated,service_role;
commit;
