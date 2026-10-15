-- One retained link so the inverse must refuse.
\set ON_ERROR_STOP on
select public.agency_pay_link_command(jsonb_build_object('agencyWorkspaceId','b0000000-0000-4000-8000-000000000020','action','create','idempotencyKey',gen_random_uuid(),'fingerprint','pop','slug','retained-link','clientName','Retained','description','Retained work','amountCents',12000),'b0000000-0000-4000-8000-000000000001','mpl-a-owner@example.test');
