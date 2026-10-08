# Portfolio scan audit scope — October 8, 2026

Prepared for #251 on `fix/portfolio-scan-audit-20261008`, based `3f3eac4f`.

Both portfolio scan routes used `tenant: "*"` when calling the canonical audit store. `audit_logs.tenant_id` is a nonnullable foreign key to actual tenants; a portfolio label cannot be inserted there. The scan could complete and then its audit insert fail, causing a failed response with no attributed result.

The routes now append one attributed result per actual returned tenant. Site scans record completed/failed status without error text. Domain checks record health without contact details or host lists. Empty portfolios do not invent a tenant record. Operator admission and scan persistence are unchanged; this is result attribution after existing scan effects, not a transaction spanning scan and audit. Audit failure still prevents a successful response; previously completed scan effects remain and can be inspected.

Local proof: the new seven-case route suite failed three cases against the old wildcard implementation and passes after repair. Combined route/scanner/domain/source-action verification passes 41 tests; typecheck, scoped ESLint, product boundaries and diff checks pass. Tests enforce real tenant IDs through a schema-shaped audit port; this is not an actual Auth-to-HTTP-to-Postgres run.

Commands: `pnpm exec vitest run src/__tests__/portfolio-scan-audit-routes.test.ts src/__tests__/scan.test.ts src/__tests__/domain-monitor-alert.test.ts src/__tests__/operator-queue-source-actions.test.ts`, `pnpm typecheck`, `pnpm check:boundaries` and scoped ESLint. Before/after/typecheck logs are retained at `/tmp/strelva-portfolio-audit-{before,after,typecheck}.log`.

No deployment, migration, provider write or production data operation occurred. Next: review and source integration; broader #251 platform-power auditing and provider neutrality remain separate acceptance.
