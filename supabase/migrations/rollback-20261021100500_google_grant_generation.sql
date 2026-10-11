begin;
-- The runtime then fails closed on missing generation support.
drop function public.mutate_google_binding_generation(uuid,timestamptz,jsonb);
commit;
