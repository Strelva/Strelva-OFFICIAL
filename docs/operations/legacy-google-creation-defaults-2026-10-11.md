# Prepared legacy Google creation prerequisite

`20261022175050_legacy_google_creation_defaults.sql` precedes the still-unapplied
`20261022175100_legacy_google_operation_authority.sql`. It removes ordinary
schema-scoped implicit table/function grants to `anon`, `authenticated` and
`service_role` for the current creator. The creator must own the canonical
`workspace_account_bindings` table. Known-role grant options or foreign grantors
abort before revocation. Future objects need explicit role grants; existing
table, column and function ACLs are untouched.

The local Supabase shim retains its original default grants. This is an actual
prepared creation-policy change, rather than a rehearsal that hides them. The
historical migration ledger, all existing migration bytes and the six-function
1751 creation guard remain unchanged. Global defaults, custom/unknown grantees,
sequence defaults and built-in PUBLIC function execution survive the prerequisite.
The release inventory registers its exact hash as held and unapplied.

Disposable PostgreSQL 18 proof applies all 353 actual historical predecessors.
It verifies unchanged existing object ACLs and global-default rows, retained
global/scoped custom canaries and PUBLIC function execution, atomic known-role
grant-option/creator-owner refusals, then exercises all 31 prepared hostile 1751
variants in separate clean database clones. Thirty refuse with exact unchanged
catalog snapshots. **The global table-owner-default revocation variant is admitted**:
PostgreSQL represents the resulting table ACL as NULL, and the frozen guard's
`coalesce(relacl, acldefault(...))` treats that as ordinary owner defaults. This
is an inherited, unqualified security finding, not a passing 31-case proof.
No event trigger or historical guard change is introduced here.

Normal 1751 creation runs last in another clean clone and passes its exact
current-catalog guard and native operation schema fixture. Its forward-only
inverse refuses without changing the catalog. The read-only current guard now
uses the frozen migration's exact parenthesized CASE expression; the former
unparenthesized copy was invalid PL/pgSQL.

Full ordered agency proof also retains the original actor-RPC OID, owner, ACL,
browser denial and service execution. Its creator successor is qualified through
the captured exact predecessor definition and current SHA256 for both declared
successor signatures, rather than requiring the pre-successor function body.
The historical application fixture supplies a fictional active seat and assigned
operator when those later tables exist; all existing authority assertions remain.

Production application is **not authorized**. Before any proposed application,
inspect the real migration creator, owner/default ACLs, already-applied versions,
future explicit grants and the retained owner-default finding. Hosted Auth,
provider execution and complete creation-authority qualification remain unproven.
No automatic inverse restores unsafe implicit role grants. The scratch evidence
and command results live in `.scratch/coherence-2026-10-11/fix-ci-sql.md` in the
parent Strelva workspace.
