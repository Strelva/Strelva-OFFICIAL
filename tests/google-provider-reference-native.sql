-- Prepared isolated native validator proof; no provider call or persisted row.
-- Run only against reviewed owned loopback native stack, never production.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';
DO $$
DECLARE business uuid := '10000000-0000-4000-8000-000000000001';
receipt uuid := '10000000-0000-4000-8000-000000000002';
ref text; payload jsonb; tenant text;
BEGIN
FOREACH tenant IN ARRAY ARRAY['workspace-' || business::text, 'legacy-frozen-tenant'] LOOP
  ref := jsonb_build_object('businessId',business::text,'request',jsonb_build_object('tenantId',tenant,'locationId','native-place','eventId','native-approved-event','draftDigest',repeat('a',64)),'receiptId',receipt::text)::text;
  IF char_length(ref)<=240 OR char_length(ref)>4096 THEN RAISE EXCEPTION 'google_reference_fixture_bound'; END IF;
  payload := jsonb_build_object('version',1,'id','fixture-activation','businessId',business::text,'possibilityId','fixture-possibility','candidateRevision',1,'actorId',business::text,'status','needs_attention','revision',1,'createdAt','2026-10-09T00:00:00.000Z','updatedAt','2026-10-09T00:00:00.000Z','pinned','[]'::jsonb,'introduced','[]'::jsonb,'connections','[]'::jsonb,'approvals','[]'::jsonb,'checks','[]'::jsonb,'history','[]'::jsonb,'steps',jsonb_build_array(jsonb_build_object('id','effect:google','kind','effect','target','google','label','Google','dependsOn','[]'::jsonb,'reversibility','compensable','idempotencyKey','exact-approved-event','status','completed','effect','accepted','attempts',1,'receipt',jsonb_build_object('providerRef',ref,'adapterMode','live','acceptedAt','2026-10-09T00:00:00.000Z'))));
  IF NOT public.make_real_activation_shape_valid(payload,business) THEN RAISE EXCEPTION 'google_reference_native_shape_rejected'; END IF;
  IF payload->'steps'->0->'receipt'->>'providerRef' IS DISTINCT FROM ref THEN RAISE EXCEPTION 'google_reference_native_changed'; END IF;
END LOOP;
END $$;
ROLLBACK;
