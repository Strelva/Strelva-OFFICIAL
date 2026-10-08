# Ordinary agency workflow — October 7, 2026

## Deployment qualification update

Jacob authorized deployment and issue closure in this session. This replaces the
older local-only inventory and failure status below; that earlier record remains
as historical evidence. Production deployment is still pending, not claimed.

The candidate now includes integration `f3097dd6`, merged as `f3483091`.
Provider access remains website-only. Incoming
`20261018110000_provider_seat_website_access` supersedes the private saved-work
migration, and `20261017120000_owner_decision_operator_refusal` supersedes the
private operator-exclusion migration. Those two unshipped private pairs were
removed. Inquiry retention now has its own `20261017110000` identity; conversion
uses the canonical `20261013220000_provider_seat_tenant_conversion`. Hosted
migration history was not changed. There are **260** unique ordered migrations.

The add-client URL path now also runs the existing private AI Visibility
assessment in the agency workspace, keyed by the same add command. Completed
and checkpointed retries avoid another probe or assessment-budget debit. Results
use the existing private work page; provider/capacity failure retains the client
and owner claim, and unmeasured results show no score. Local proof: 85 focused
tests, 260-migration agency checkpoint/replay/count assertions, and desktop/mobile
UI states with mocked HTTP/provider responses. No paid provider call was made.
Live Gemini success remains unproven.

Current local evidence:

- Full unit suite: **8,480 passed, 42 skipped**, 899 passing files / two skipped.
  `/tmp/strelva-agency-deploy-final-with-ai-tests.log`.
  The subsequent packet-staging correction also passes all 27 focused tests.
- Ordered agency SQL job: **260 migrations, passed**.
  `/tmp/strelva-agency-deploy-workflow.log`.
- Complete workspace upgrade: **passed**, including actual staffed-provider
  owner-only refusals and verified-owner recipient trust.
  `/tmp/strelva-owner-recipient-upgrade-20261007.log`.
- Production build: **Next 16.3.8 passed**. Existing dependencies were patched;
  production dependency audit reports no known vulnerabilities.
  `/tmp/strelva-agency-deploy-build.log`,
  `/tmp/strelva-agency-deploy-audit-patched.log`.
- Current authenticated agency browser journey: **one passed, 26.8 seconds**
  against a fresh 260-migration disposable Auth stack. Same explicit delivery
  and verification fixtures described below. Evidence:
  `.scratch/agency-workflow-proof/2026-10-07/release-candidate-260/`.
- Compatibility: **196/196 custom-repository checks passed**.
- Batch 8: **118 forward files**, receipt-preserving companions followed by
  separately authorized empty-only structural completion restore the exact
  catalog/ACL; a second forward reproduces the first. Populated evidence,
  all four retained fields, new flags/history, incompatible old constraints,
  missing authority and function drift refuse atomically. This is local proof,
  not authorization or proof of recovery on a populated production database.
  `/tmp/strelva-batch8-empty-completion.log`.

The broader flags-off browser suite remains unqualified: five private-app cases
expect owners to create/design/publish apps, which current authority refuses.
These are retained failures; no agency app grant or owner permission was added
to make them pass. The separate conversion fixture now passes with an explicit ordinary agency,
named staff and existing-contract basis, zero agency/operator client memberships,
and the actual owner reading the owner feed. The focused website job is not proof
of the whole 1.0 launch, grouped activation, apps, or existing-client conversion.

Read-only production checks identify the actual app project as `strelva-admin`
(`prj_AzaQBS8jM9E5RVgHuMWnQju0GIxb`). Existing live deployment remains
`dpl_9ViM5iWeCepPiio8k3AZ5NFwKFPx`. Production has **86 applied migrations**,
so the complete candidate inventory has **174 pending**; approved packet order
and fresh restored-copy qualification remain prerequisites to a database write.
Fresh private schema/data dumps are retained under
`~/.strelva-prod-ops/dumps/agency-workflow-20261007/`; these separate dumps are
not one exported consistent snapshot. Baseline storefront capture returned
**60/60 HTTP 200** across all 12 active tenant slugs, with only hashes retained.

Sensitive production variables are not exportable as plaintext by Vercel env
pull. The identical short exported placeholders for the encryption key and three
sensitive flags are **not their deployed values**. Do not overwrite them or infer
current effective flag states from those placeholders. The native production
artifact must inherit the existing provider configuration and be observed.

# Earlier local preparation record


Objective: an ordinary agency adds a client, prepares a website, receives the
owner's exact approval, publishes with explicit business authority, and reads a
retained receipt. No agency client membership or platform operator role is a
prerequisite.

## Prepared implementation

Worktree: `/Users/jacobrhinehart/Desktop/strelva/REB-agency-workflow`.
Branch: `agency/workflow-proof-20261007`. Started at integration `56eef0a3`;
reconciled incoming integration at **`82bb8e66`**, locally committed as
`1b46e858`. Later integration commits require a fresh merge and qualification.
The main `REB` checkout's existing changes were preserved. Nothing here was
pushed, deployed, converted on a live client, or sent to an external recipient.

Existing [add-client #562](https://github.com/Strelva/Strelva-OFFICIAL/pull/562),
[provider gates #563](https://github.com/Strelva/Strelva-OFFICIAL/pull/563),
[owner effects #568](https://github.com/Strelva/Strelva-OFFICIAL/pull/568), and
[seat conversion #565](https://github.com/Strelva/Strelva-OFFICIAL/pull/565)
were composed locally, then reconciled with the incoming integration.
This evidence does not close or merge issues externally.

The new pieces complete the gaps between those features:

- Full current provider seats open saved website work and its CAS update.
  Scoped delegations never become full workspace membership; current seat,
  staffing and actor role are rechecked on reads and writes.
- The owner sees an unchecked control naming the current agency. Explicit
  consent atomically approves the exact candidate and grants publication for
  only this website System. A provider change or ended seat commits neither.
  Anonymous preview approval grants no resource mandate. Future candidates
  still clear approval; domain authority remains separate.
- Trusted no-account owner links can retain an ordinary provider's seated
  execution identity while preserving recipient trust, delivered-link binding,
  effect verification, native resource gates and creator-only lifecycles.
- Agency add retry identity uses the original request instead of mutable
  inferred site/prospect names. The current integration's narrow authorization
  preflight refuses access before crawling.
- Google reply integration preserves the named agency through both provider
  rechecks. This is a local regression repair, not proof of Google operation.
- Below 1024px the frame releases its navigation rail width immediately.
  Browser proof checks actual main bounds and nested overflow, then scrolls
  receipts into the visible viewport. The original clipped image is retained.

## Migration order and recovery

Existing provider-seat conversion originally collided with inquiry retention
at `20261013220000`. Its prepared forward/rollback pair is now
**`20261013221000_provider_seat_tenant_conversion`**. This branch adds duplicate
version refusal to migration inventory/staging; the regression proves no files
are staged after a duplicate. The correction is private candidate code; hosted migration history was not edited.
Verify the actual applied inventory before any promotion.

The new prepared migrations are:

1. `20261014102100_provider_saved_work_authority` — seat-scoped saved work CAS.
2. `20261015111000_website_owner_agency_publish` — explicit owner approval and
   website-only publication mandate. The timestamp avoids super-admin grants.
3. `20261015120000_owner_link_provider_identity` — two owner-link execution
   identity functions. Incoming `141120` already restores the native mandate
   gate, so this migration does not duplicate that patch.
4. `20261015121000_owner_decision_operator_exclusion` — preserve both platform
   operator and provider exclusions from owner-only decisions while ordinary
   provider staff can still decide platform work. Exact rollback/reapply passes.

Each has a rollback companion. Identity rollback checks the exact function
fingerprints and restores the integrated predecessor; the workflow rehearsal
compares before/after/reapplied catalog fingerprints. Consent rollback drops
only its new entry points and preserves approved documents and mandates.
The saved-work rollback retains the prior CAS/history/identity contracts.
A retained owner-link session remains a stop point for effect migration rollback.

## Local proof

| Proof | Observed result and scope |
| --- | --- |
| `pnpm check:agency-workflow` | 259 ordered migrations; real actor-bearing `service_role` calls for add/replay, seat-only draft, owner claim/trust/approval, scoped consent, guarded native publish, receipt/replay, stale candidates and revocation; exact identity rollback/reapply. |
| Authenticated browser journey | Real local Supabase Auth/Postgres and production routes/UI; 1 passed in 14.2s after the final owner-boundary repair. Zero agency client memberships and super-admin rows. |
| Focused unit/contract tests | 157 passed across nine files on final code; another 19 readiness tests pass after adding the incoming gate table sentinel. |
| `pnpm typecheck` and targeted ESLint | Passed on the integrated code. |
| `pnpm build` | Passed; production build generation, no deployment. |
| `pnpm check:boundaries` | Passed; no new layer violations. |
| `pnpm check:custom-repos` | 196/196 compatibility checks passed at existing pins. |
| Migration inventory | Duplicate-version refusal and existing staging/target tests passed. |
| `pnpm check:workspace-sql` | Passed on final authority code: forward, exact rollback/reapply, populated provider conversion, brand and retained owner-effect sessions. |

The browser creates an ordinary fictional agency, adds a no-URL prospect through
the real UI, claims the business with its verified owner account, establishes the
owner recipient through the record UI, builds from a description with the
production rules fallback, approves the exact candidate through an owner link,
then authorizes publication through the authenticated owner's unchecked control.
Unverified publication and verified-but-unmandated publication are refused.
Agency launch produces one immutable receipt; replay retains its ID. A second
agency's reads and effects are denied.

The test explicitly simulates platform publish verification and approval-link
email delivery in the disposable database. It uses the production delivery RPC,
first proves that a suppressed/unbound link is refused, and never inserts a
binding directly. No email provider, model API, payment provider, DNS service or
hosted database is called. Owner claim delivery remains the existing approved
no-email path; the browser opens its displayed claim link.

Public HTTPS readback honestly fails because this fictional site was never
hosted on public DNS. The receipt/UI retain that failure. Separately, the actual
loopback public renderer serves the published hash on desktop and 390px mobile.
That independent render is local publication evidence, not public operation.

Run the browser test after preparing the existing disposable Auth stack with
`STRELVA_LOCAL_AUTH_PROOF=1`, all workflow release gates enabled, development
bypass off, Postgres stores selected, and provider/model/email secrets unset:

```bash
pnpm exec playwright test tests/agency-workflow-authenticated-local.spec.ts --reporter=line
```

This session's private local runner is
`/tmp/strelva-agency-workflow-auth/test-env.sh`; it uses the fresh final stack,
app port 3147, and `.next-agency-workflow`. Loopback-only keys are in its local
restricted env file, never in this document or Git. The owned dev server and
both disposable Auth stacks were stopped after verification; local stack
volumes and evidence are retained. Restart the stack from the saved
`STRELVA_AUTH_STACK_DIR` before starting the local app. Restart Next after replacing
a store singleton, and reload PostgREST schema after adding RPCs.

Rendered evidence is local and intentionally untracked:
`.scratch/agency-workflow-proof/2026-10-07/final/` holds nine final screenshots,
including owner top layout and visible receipts at desktop/mobile. The parent
folder retains the earlier clipped mobile screenshot and earlier successful
link/provider states. Full-suite and rehearsal logs remain under
`/tmp/strelva-agency-*.log`.

## Failures and remaining proof

The first full suite reported 8409 passed, 11 failures and 42 skipped. Two
integration failures were repaired (actual-envelope email gate duplication and
agency staff Google authority). Five timeout failures passed a small-worker
rerun: 65 passed, one skipped. Five remaining assertions reproduce on untouched
starting commit `56eef0a3`: quoted email sender presentation (access delivery/invites/newsletters),
trusted-recipient fail-closed fallback, and the release command's domain check.
The integrated full suite reported 8418 passed, six failed and 42 skipped.
Five failures match the untouched starting commit; the sixth was the incoming
acting-provider predecessor table's missing readiness sentinel, now repaired
and verified by all 19 readiness tests. No whole-suite green result is claimed.
The original expectation for resolver failure remains fail-closed.

The full ordered upgrade also exposed a stale connected-inquiry fixture that
inserted an owner fact directly without establishing trust. It now uses the
verified owner's actual patch RPC. The next failure exposed a genuine incoming
`141120` regression: a platform operator with direct client-admin membership
could claim an owner-only decision. That is a required owner-boundary repair,
not a reason to weaken the test. The new `151210` migration restores the exclusion. Actual `service_role`
contracts now prove ordinary agency platform decisions remain allowed while
active operators and serving agency admins cannot decide owner-only items.
Both new authority migrations compare exact catalog fingerprints on rollback
and reapply.

The broad upgrade subsequently exposed two older fixture assumptions. An
operator invitation fixture now uses an untrusted recipient to prove distinct
approval is required; the approved existing no-email trusted-recipient path
allows the same operator and remains covered separately. Finally, the retained
owner-recipient trust fixture expects `owner_decision_owner_only` from a
platform-only operator who no longer holds provider authority; the current
native gate instead refuses with `owner_decision_permission_denied`. The broad
upgrade remains failed at `tests/owner-recipient-trust-schema.sql:276`. Reconcile
that fixture with an actual current provider before claiming the entire upgrade
ladder passes. The complete agency job and dedicated owner-only boundary
contracts pass independently; no production gate was relaxed.

No real owner received an email. No agency/customer adoption, delivered public
website, pricing acceptance, actual operating cost, support rate or margin is
measured. Neither a local passing journey nor an immutable receipt proves those.

## Capability and vault reconciliation

`chg-agency-workflow-20261007` changes local implementation/behavior evidence for
ordinary agency delivery and owner-scoped publication authority. Relevant
canonical IDs: `PRIM_SYSTEM`, `COMP_AGENCY_UPGRADES`, `DIST_AGENCY_CHANNEL`,
`RULE_EMAIL_GATE`, `COMP_MULTI_SYSTEM_ACTIVATION`, `BOTTLENECK_PROD_YES`.

Overhang finding: the current agency website job can now be rehearsed end to end
without platform privilege or direct customer membership. Explicit owner consent
removes a real execution prerequisite; receipt/hash evidence reduces ambiguity
after retry. Live email delivery, public hosting and ordinary customer adoption
remain the decisive missing mechanisms. This adds no authority for another
resource, another surface, cross-client upgrades or grouped Make real.

Feature-vault review: existing agency/System upgrade, fact-to-public and
multi-System activation futures remain unpromoted. This proves a bounded website
job, not restart-safe grouped activation, reusable cross-client rollout or
maintained multi-surface accuracy. The complete ordered rehearsal is a tested
factory capability; recurring attention savings are not measured.
Product-vault review: no new buyer, commercial offer, pricing, platform
responsibility or active company bet was selected. Ordinary agency distribution
remains an adoption/economics hypothesis. Both affected future neighborhoods
were considered; no new future is activated.

Canonical write propagation is **deferred**, rather than represented as done.
Main `REB/PRODUCT_MODEL.md` revision 8 includes independent production/cleanup
history, while integration revision 7 includes independent provider conversion
history. Preserve both evidence sets. Exact next action: snapshot both models,
merge stable source/node IDs and both dated change histories, append this
local evidence and the owner-boundary repair at a new coherent revision, retain
production/marketing stop points, validate retained IDs, then regenerate only
affected views. This handoff is the proposed delta, not a second canonical model.

## Next action

Review this isolated branch against integration `82bb8e66` and its later changes.
Re-run the ordered SQL and authenticated browser journey after any overlap in
provider authority, owner recipients, publication or saved work. Reconcile the
canonical model delta above. The next stronger outcome proof is an explicitly
authorized isolated hosted journey with actual owner delivery/public readback;
production, external messages, DNS, spend and client conversion remain reserved.
