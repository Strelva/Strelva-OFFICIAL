# Booking settings creation authority guard — 2026-10-09

Prepared successor to frozen07497dc37e99e76fab6434185f8e8f63e1e56b89. No native window was admitted to this lane. Root independently identified another forward1820 hold: REVOKE PUBLIC/anon/authenticated followed by GRANT service_role did not remove custom default function EXECUTE grants. Previous packets remain frozen and held separately; no production migration or provider write is authorized.

## Root-observed failure

Root actual native creation-ACL witness: exact prior forward SHA256 `5bb27c5b3b245aa0989e203d61fd5fb9090cfd66c1bf9665efcf5eda23abad18` applied exit0 against a minimal booking rowtype fixture with fictional_default_grantee default EXECUTE. Post-commit has_function_privilege remained true. Receipt/setup/forward/ACL logs: `/private/tmp/strelva-booking-acl-witness-gn0737_t`. Root reported owned PG stop0/status3/postmaster file absent, then removed only its own data. This is actual creation-ACL exposure evidence, not booking RPC, concurrency, or this successor's qualification.

## Correction

The forward migration now checks pg_proc atomically after CREATE/REVOKE/GRANT and before COMMIT. It pins the unchanged primary function body SHA256 `438660a6cd739eb617287ea2ab2ecbddf54d93b687ce8afba043be485d388010`, exact signature/arguments/return/language/security-definer contract, all guarded execution/default/search-path properties, owner equal to booking_settings table owner, and exactly owner + service_role non-grantable EXECUTE grants from that owner. Unexpected default grantees, grant options, missing owner grant or other metadata/owner drift raise booking_settings_atomic_create_authority_drift; body/missing drift raises booking_settings_atomic_create_source_drift. Failure aborts the entire forward transaction, so the RPC never becomes admitted. No mutable comment/journal snapshot is used for authority.

Forward filename/allocation unchanged: prospective352, `20261022182000_booking_settings_atomic_patch.sql`. New exact forward SHA256 `6497dd7346ce3f9e9e77409b5fc933871ac931dc266e792dd4806ffcf0b07ce6`. The primary function body, guarded inverse, native cleanup helper and application source are byte-identical to07497. No historical file, registry, budget or dependency changes here; root alone updates frozen SHA/registry after native review.

## Local source/fake evidence

New static admission regression against actual frozen07497 forward bytes: 1 FAIL (no post-create check of final inherited grants); successor bytes restored in finally. Final `node --test scripts/tests/booking-settings-atomic-guard.node-test.mjs`: 10 PASS, including forward/inverse body pin and complete authority guard placement, plus unchanged eight actual-shell fake-psql cleanup cases. Scoped ESLint, bash -n of new forward native helper and git diff --check PASS. A host Perl shasum failed due inherited C.UTF-8 locale; Python hashlib computed the exact forward SHA above. No source or authority decision depended on that failed utility.

## Native probes prepared, unrun by lane

Source `scripts/sql/booking-settings-forward-identity.sh` with root-owned repo_root/cluster_root/psql_args in a prepared disposable /tmp or /private/tmp Unix-socket cluster. Call `run_booking_settings_forward_identity` with the target RPC initially absent. It invokes the ACTUAL forward file in three hostile default privilege transactions:

- unexpected pg_monitor EXECUTE WITH GRANT OPTION (existing built-in role, no added dependency/role);
- service_role EXECUTE WITH GRANT OPTION;
- owner default EXECUTE revoked.

Each must fail with exact create_authority_drift, leave no RPC, and restore the actor's entire pg_default_acl fingerprint after connection rollback. The outer BEGIN plus failed forward BEGIN never reaches its COMMIT. Existing default privileges are not intentionally mutated outside those failed transactions. Files and logs retained privately in root cluster_root. This starts no daemon and never calls a provider.

Root can also replay the exact fictional_default_grantee witness setup against this exact SHA: it must abort and leave no RPC. Then run normal forward success, real primary SQL cases, both controlled row-lock orders/final confirmed cleanup, inverse identity drift, successful inverse/reapply and actual settings/ACL preservation from the prior handoffs. Actual owner/catalog/ACL behavior and all native proof remain required before admission.

Next: independently review the full held chain (69637 +5227 +07497 +this successor), or a squash against99c4, and qualify root-owned exact native bytes. Source/fake checks alone do not authorize import, activation, production or provider work. Root owns canonical model/state and prospective352 registration.
