begin;
-- Existing generation-bound runtime refuses mutations when this RPC is absent.
drop function public.mutate_tenant_provider_connection(text,text,jsonb,jsonb,text,timestamptz);
commit;
