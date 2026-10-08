# Content receipts and native Live Version authority

Prepared October 8 from release baseline `e9ac136f`; issues
[#495](https://github.com/Strelva/Strelva-OFFICIAL/issues/495) and
[#494](https://github.com/Strelva/Strelva-OFFICIAL/issues/494). This is isolated
local implementation and proof. Production, target qualification, release flags
and issued historical receipts/decisions are unchanged.

## Found and changed

`write_operator_content` still accepted actorless client content and recorded
only the historical `strelva_content` transport identifier. The additive
`20261020110000_content_publication_authority` successor introduces
`write_content_as_actor`: a verified business owner, or the currently serving
agency's staffed provider with publish verification and the exact website
mandate. It snapshots `request.authorship` with the actor user ID, authority,
and actual agency workspace ID/name; self-serve owner actions name no agency.
The existing transport vocabulary remains separate from agency identity. A
later rename, replacement or revoked grant cannot rewrite accepted authorship.

Content PUT, site-editor draft publication and the existing admin draft
publication path pass the verified actor explicitly. An operator flag or direct
client admin membership grants no provider authority. The atomic content/receipt
transaction and separate readback settlement retain their existing behavior.
New receipts offer recovery into a draft, followed by review/publication; they
never advertise the unqualified internal live Undo. Authenticated site-snapshot
restoration carries its existing actor for each write and recovery attempt.
Unconverted tenants retain the existing legacy contract. Actorless calls to the
old writer refuse converted businesses when the receipt path is selected.

Neutral Needs-you claimant gates already superseded the direct operator shortcut,
but native `save_system_version` still accepted a historical operator-reviewed
Live decision. The additive `20261020112000_version_live_owner_authority`
successor requires a signed-in owner-session decision by a currently verified
owner, and a current owner executing the exact candidate. The deciding owner
membership and verified identity rows stay share-locked through publication,
including when the executor is a different owner. Version preparation
now routes to the owner even when a policy requests provider review. Agency
staff retain draft preparation; no app effect mandate is invented. Version,
System, baseline, row revision and candidate checks remain in the transaction.
Old decisions and released history are retained unchanged.

Both successors and companions are pinned in proposed batch 12. Empty-output
rollback captures/restores the actual integrated predecessors; content rollback
refuses after an attributed receipt exists. Function/body drift refuses recovery
instead of overwriting a later successor.

## Local evidence

- 93 focused unit tests passed: content repository/storage actor propagation,
  Version owner routing, release decisions, native runtime contracts and
  actor-bearing snapshot restoration/partial recovery. With release checks,
  all 148 selected tests pass.
- Typecheck passed.
- `check:agency-workflow` passed all 268 ordered migrations, preserving ordinary
  provider draft preparation, owner approval, scoped publication and revocation.
- `bash scripts/check-content-version-authority-sql.sh` applies the full ordered
  schema and tests service-role-only mutation; actorless/operator/wrong-agency
  denial; verified identity; wrong effect and website mandate; verification and
  mandate revocation; exact owner/provider receipt snapshots; rename retention;
  atomic receipt failure; historical operator approval refusal; owner identity
  and role revocation; exact native candidate, stale action and failed runtime
  preservation. It also rolls back/reapplies both successors and compares every
  public function's signature, owner, ACL and body (retaining every existing
  function OID). It refuses introduced-writer body/configuration and ACL drift
  atomically, refuses rollback after issued attribution, and concurrently proves
  identity/role revocation waits behind content publication and distinct native
  deciding/executing owners. Failed snapshot recovery names the unrecovered
  sections rather than claiming a complete rollback.
- 55 release inventory/recovery tests passed. Actual
  `pnpm check:release-safety:batch8 --current-tail` passed two recovery rounds:
  42 tail files, 188 introduced service RPCs dark/restored, exact public rows and
  catalog retained. Local receipt:
  `output/release-safety/batch8-1791467376818` in this isolated worktree.
- The authenticated minimum three-flag agency website browser journey passed.
  It is regression proof for ordinary agency/owner behavior, not a hosted
  publication or browser proof of the new receipt-enabled content route.
- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-content-authority-http.sh`
  passed with real signed-in local Auth sessions, Postgres content/operational
  stores, the full forward schema including both successors, and
  `STRELVA_OPERATOR_QUEUE_RELEASE=1`. No access bypass or outside provider is
  enabled. Owner Content PUT and owner draft publication return 200, with
  accepted receipts, actual owner identity and matched stored/public content
  projection. The currently staffed, publish-verified serving agency with the
  exact adopted website mandate also publishes through Content PUT; its receipt
  snapshots the actual agency ID/name and actor separately from `strelva_content`.
  A linked admin who still holds legacy content permission and direct client
  admin membership is refused on PUT and publish, as is a freshly revoked
  owner with legacy permission retained. Exact accepted content and receipt
  rows stay unchanged; the refused publication remains a draft. Existing
  handlers surface these database denials as 500. This proof does not claim a
  new HTTP error classification. The synthetic custom repo has no revalidation
  URL: publication reports accepted content alongside failed outside
  revalidation (`Missing revalidateUrl`), rather than treating matching content
  projection as observed storefront delivery.

Initial browser startup failed because a dependency symlink pointed outside the
Turbopack filesystem root. Cloning the already installed dependencies locally
resolved startup; no package or dependency was added. Failure log is retained at
`/tmp/strelva-provider-attribution-browser.log`; successful run is recorded in
`/tmp/strelva-provider-attribution-browser-second.log` with private local artifact
path `strelva-agency-minimum.QYOUxO`. Focused SQL fixture failures were corrected
against the actual final schema; these logs remain local, not release evidence.

Final sanitized HTTP proof log:
`/tmp/strelva-provider-attribution-http-final-sanitized.log`. Private workdir:
`/var/folders/0t/9xnfycn50vd2yv5gb7p4cdsh0000gn/T/strelva-content-authority.TmNIs6`;
`results.json` and `evidence/` retain accepted receipt/refusal evidence. The
implementation commit at proof start was `61309856`; proof source SHA-256:
runner `9c275ba7b81bf35da7f32a020d96f84a81622ef864a832fd65940113e1382544`,
spec `a9a5564cc06e90165a8103aff334c8d002af61433abacd4133ed0aa7f3563798`.
The initial HTTP run accepted owner PUT/publication
but stopped at a fixture assertion that expected no configured storefront
instead of the actual missing-custom-repo-revalidation failure. Its log and
trace remain under `strelva-content-authority.Y0sWS5` and
`/tmp/strelva-provider-attribution-http.log`. The corrected assertion preserves
the route's actual distinction between accepted content and outside delivery.

HTTP refusal currently returns the existing generic 500 response. A future
usability repair can classify current-authority denial explicitly; these tests
prove refusal/no accepted content or receipt mutation, not a retry entitlement.

Root's first combined full-suite run found one stale publication assertion:
8,575 passed, one failed, 46 skipped (8,622 total), retained in
`/tmp/strelva-backlog-combined-full-tests-20261008.log`. The old site-editor mock
had no user ID and expected three `setContent` arguments. Its follow-up uses a
complete verified owner `ActorContext` and asserts that exact actor as the fourth
publication argument. Production code, publication acceptance and snapshot
behavior were not changed to accommodate the stale test. All 64 focused
site-editor/content/receipt/Postgres snapshot tests passed in five files;
typecheck and targeted lint passed. Logs:
`/tmp/strelva-provider-attribution-publish-followup-tests.log` and
`/tmp/strelva-provider-attribution-publish-followup-typecheck.log`.
The full combined-suite rerun belongs to root's integration proof.

## Limits and next action

Existing actorless automated section updates, internal live Undo, provisioning and public
append paths are not assigned an invented provider identity. For converted
businesses with the receipt flag on, they refuse until their exact authority is
qualified and explicitly carried. Route those through real owner/provider
mandates and their exact immutable decisions before claiming general automation
continuity. Native collection/newsletter receipts and broader publication callers
remain outside this section-content repair.

Next: review the proposed branch with the other prepared successors, run the
combined final migration inventory/recovery checks, and qualify the target
before any rollout or hosted acceptance claim. Retain #494/#495 as
open until integration and the relevant acceptance evidence are reviewed. No
production migration, rollout, deploy or issue closure is authorized by this record.
