-- ADR 0015 (20261023143000): a business's AI cost in its current period.
\set ON_ERROR_STOP 1
begin;
insert into public.users(id,email,verified_at) values ('7a000000-0000-4000-8000-000000000001','owner@budget.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('7a000000-0000-4000-8000-0000000000b1','customer','Budget Bakery','7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-8000-0000000000b2','customer','Other Shop','7a000000-0000-4000-8000-000000000001');
insert into public.model_call_log(called_at,purpose,workspace_id,actor_kind,model_label,attempt,step,latency_ms,outcome,cost_usd,cost_source,price_table_version) values
  (clock_timestamp(),'ask','7a000000-0000-4000-8000-0000000000b1','owner','model',1,1,10,'ok',0.25,'estimate','v1'),
  (clock_timestamp(),'rebuild','7a000000-0000-4000-8000-0000000000b1','owner','model',1,1,10,'ok',1.50,'estimate','v1'),
  (clock_timestamp() - interval '40 days','ask','7a000000-0000-4000-8000-0000000000b1','owner','model',1,1,10,'ok',9.00,'estimate','v1'),
  (clock_timestamp(),'ask','7a000000-0000-4000-8000-0000000000b2','owner','model',1,1,10,'ok',4.00,'estimate','v1');
do $$
declare b jsonb := public.business_ai_budget('7a000000-0000-4000-8000-0000000000b1');
begin
  if (b->>'spentUsd')::numeric <> 1.75 then raise exception 'expected 1.75 this month, got %', b; end if;
  if (b->>'subscribed')::boolean or b->'capCents' <> 'null'::jsonb then raise exception 'no subscription should mean no plan cap: %', b; end if;
  if public.business_ai_budget(null) is not null then raise exception 'null business should read null'; end if;
end $$;
rollback;
