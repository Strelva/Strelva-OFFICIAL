# Audit service-role mutation restriction — October 8, 2026

Prepared locally for #528. Not merged, migrated or deployed. Base `e9ac136f`
records the earlier bounded security/agency release; it grants no new rollout
authority. Existing dirty main, customer and release checkouts were preserved.

## Finding and repair

PR #545 head `20df08ba` passed 4,039 units but hosted CI failed at dependency
audit: Next.js <16.3.8 and Sharp <0.35.5. Those patches and the identical legacy
browser-access migration are already present in the recorded deployed source
`954f1905`; repairing that old PR alone would duplicate the newer release.
#528 explicitly remains open for the service-role audit requirement.

The disposable PostgreSQL regression failed on the actual `service_role`
UPDATE of an existing audit action. Supabase's default server table grants
remain after the browser grant repair. Runtime audit repositories only append
and read, so the new successor migration restricts this one server table ACL to
SELECT/INSERT, revokes column UPDATE grants, and refuses unexpected effective
inherited, browser, superuser or table-owner authority atomically. No deployed
migration, RPC body, RLS policy, foreign key, provider or application code changes.

An additional ownership probe failed before the explicit ownership guard was
added: revoking an owner's explicit UPDATE can make `has_table_privilege`
false even though the owner can grant the privilege back. The final migration
also checks `pg_has_role(service_role, table_owner, MEMBER)` and superuser status.

## Deliberate lifecycle boundary

This is direct server-table append-only access, not indefinite audit immutability.
The existing SECURITY DEFINER `deprovision_tenant_rows` deliberately removes
tenant audit rows inside its atomic cleanup. Existing tenant deletion cascades,
tenant rename cascades, and actor account deletion (`ON DELETE SET NULL`) retain
their established behavior. SQL tests exercise all these paths without permitting
arbitrary audit payload UPDATE, DELETE, TRUNCATE or conflict-upsert.

The existing client/user deletion authority and the Redis audit compatibility
store are outside this ACL repair. An immutable retention or deletion-policy
change needs a separate explicit decision; do not infer it from this migration.

## Local proof

- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-audit-append-only-sql.sh`
  applies the full 267-migration schema with real Supabase-style server table
  defaults. Actual server append/read passes; raw UPDATE/DELETE/TRUNCATE/upsert
  refuses; payload preservation, actor deletion, tenant rename/direct cascade
  and atomic cleanup pass. Column drift is repaired. Inherited mutation grants,
  browser column access and service-owned audit tables refuse atomically.
  Reapplication passes; the rollback refuses reopening audit tampering.
- `pnpm typecheck` passes.
- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`
  and `pnpm check:workspace-upgrade` pass. The former invokes the new full-schema
  audit runner; the latter includes the new lifecycle/denial SQL contract.
- `bash -n scripts/check-audit-append-only-sql.sh` and `git diff --check` pass.
- Release inventory follow-up: the original `--current-tail` gate refused
  `Migrations missing from the prepared packet: 20261020111000_audit_service_role_append_only.sql`.
  Proposed, unapplied batch 12 now pins the successor and rollback SHA256;
  every previous baseline/batch/proposed entry and original recovery scope is
  preserved. No rollout authority follows from this prepared inventory.
- `pnpm exec vitest run src/__tests__/release-safety-tools.test.ts src/__tests__/release-restore.test.ts`
  passes all 32 tests. `pnpm check:release-safety:batch8 --current-tail` qualifies
  all 267 forwards and 41 corrective tails. Both recovery rounds disable 188
  active service RPCs, preserve every public row and restore the exact secured
  catalog. Original scope remains 85 files/238 signatures (189 original service
  RPCs, one later retired). The successor's audit ACL survives both rounds.

The before-fix error was `service_role could mutate existing audit: update
public.audit_logs set action='forged' where id='audit528-original'`.
Local logs are retained under `output/issue-528-audit-2026-10-08/`; the
`proof.json` manifest pins SHA256 values and the tested source files.
No hosted CI, target ACL/role graph, production read/write, adoption or deployment
proof is established by this work.
In particular, hosted superuser attributes and noninherited SET ROLE paths are
not qualified; this follow-up does not expand the independently reviewed ACL
repair. `runtime-recovery-receipt.json` beside the proof manifest retains the
complete current-tail file hashes and original scope from the local run.

## Continuation

Objective: finish the remaining bounded #528 server-table audit requirement.
Next: independently review the draft successor against
`release/security-runtime-20261007`, refresh its exact hosted target ACL/ownership
only with the required authority, and prepare a separately approved one-migration
rollout. Keep #528 open until the selected acceptance boundary and applied state
are proven. Supersede #545's duplicate migration scope in tracker disposition
only after review; no issue comment or closure was performed here.

Canonical `PRODUCT_MODEL.md` is dirty in the owning main checkout. Proposed
unapplied delta: attach the prepared bounded audit ACL repair and local refusal
proof to the existing release-security evidence, preserving lifecycle deletion
exceptions and leaving deployment/operation unknown. Parent coordinator owns
model reconciliation and any affected overhang/vault review; no alternate model
or new product/offer is created.
