# October 12 UX integration: release gates

The integration source remains local and uncommitted. Prepared migrations are
proposed and unqualified. No production environment, provider, database or
release default changes are authorized by this record.

## Operator conversion

`STRELVA_TENANT_CONVERSION=1` admits the authenticated operator conversion
surface at `/admin/convert`. Its default is off. It uses the existing conversion
engine, reviewed source digest, explicit ordinary agency and assigned staff,
dry run, saved receipt and authoritative Undo eligibility. Dev access bypass
does not grant conversion authority.

Remote conversion additionally requires
`STRELVA_TENANT_CONVERSION_PRODUCTION_APPROVED=1`. Its default is off, and
setting it requires Jacob's explicit authorization. These flags do not replace
verified operator identity, current source review, native schema qualification
or the existing release checklist.

## Public entry

Optional `STRELVA_MARKETING_ORIGIN` directs platform `/` and `/home` to a
separate marketing origin, preserving acquisition parameters. It must be an
HTTPS origin without credentials, a path, query or fragment (HTTP is accepted only for local development), and cannot be the request host
or app host. Invalid or loop-prone configuration retains the paper two-door
entry. It never redirects tenant roots. No value is selected by this work.

Both agency embed aliases present the combined website/Gemini check. The
combined `/api/audit/check` composes the two existing API contracts with one
request-local, durable agency quota admission. Each independent check gets its
own admission; standalone callers retain their existing quota behavior. A
section failure retains the other result and its own saved identity. There is
no request header or body field that can bypass admission.

## Remaining qualification

Run the composed disposable SQL jobs in an environment allowing PostgreSQL
shared memory. Browser, Auth, hosted provider delivery, actual billed AI cost
and production routing remain separate proof requirements. The audit brief
prohibits dev/build/Playwright/Docker during this integration because of disk
pressure. Source/DOM checks do not establish desktop or phone geometry.

Follow the [production release checklist](horizontal-release-checklist-2026-09-11.md#september-21-production-preparation)
before any separately authorized rollout. Environment changes require a new
production deployment, not a redeploy. The exact integration check receipts,
remaining failures and next actions are retained in the coordinator's
`uxaudit-2026-10-12/fix/integrate.md` handoff.
