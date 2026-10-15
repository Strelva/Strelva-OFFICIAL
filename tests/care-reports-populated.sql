-- One retained report so the inverse must refuse.
\set ON_ERROR_STOP on
select public.generate_care_reports('c0100000-0000-4000-8000-000000000020','c0100000-0000-4000-8000-000000000001','cr-owner@example.test',
  date_trunc('month',now())::date,array['c0100000-0000-4000-8000-000000000010']::uuid[],null);
