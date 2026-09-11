# First horizontal implementation scope

Status: Jacob accepted interview recommendations Q79-Q86. This selects the next
local implementation scope, not a production release or a permanent product limit.
Parent direction: [confirmed brief](./horizontal-product-brief-2026-09-11.md).
Architecture evidence: [audit and staged plan](./horizontal-audit-and-plan-2026-09-11.md).

## Selected experience

Use the existing shared workspace for both customer work and internal R&D.
R&D is an experimental use of the product with additional evaluation controls,
not another isolated application. Preserve existing work and links.

The creation experiment turns a supplied spreadsheet into an interactive tracker.
The ongoing-work experiment keeps an inquiry moving through assignment,
acknowledgment and escalation. The pair tests different behavior behind a common
way to request work, inspect results, involve someone, and record evidence.

## Acceptance: shared work

- Both experiments appear in the existing workspace and reopen by stable links.
- A signed-in user can resume saved work after a reload; no reliance on preview
  memory for acceptance.
- Each job shows its intended result, current state, required decision, result
  evidence, and known cost. Unknown cost stays unknown, not zero.
- A permitted reviewer can inspect the same work and its scoped handoff brief.
  Asking for help never silently grants write, publish or spending authority.
- Denied access, revoked access, unavailable storage, conflicting edits and
  interrupted execution are tested alongside the successful journey.
- Inspect realistic desktop and mobile journeys, including keyboard use and
  loading, empty and error states.

## Acceptance: spreadsheet to tracker

- A user supplies a supported file and sees the proposed field mapping and
  tracker before accepting creation. Supported formats and limits are explicit.
- Preserve the original source and row references. Flag ambiguous types, duplicate
  headers, unsupported formulas and import errors instead of silently losing data.
- The tracker supports meaningful edits and filtering using approved interface
  components. Saved edits survive reload and produce attributable history.
- Re-import behavior is explicit; an import cannot silently overwrite later edits.
- Unsupported workbook behavior is reported. Do not claim spreadsheet-equivalent
  calculation or lossless conversion until demonstrated.
- Evaluate at least two structurally different synthetic inputs before a
  customer-data experiment. Measure setup, correction and review time.

## Acceptance: ongoing inquiry work

- Integrate the existing inquiry lifecycle into the shared workspace rather than
  adding another browser-only demo.
- A submitted inquiry has durable evidence, a responsible person, and a visible
  next step. Define acknowledgment and reply evidence separately.
- Waiting, restart, retry, pause, revocation and cancellation preserve the record
  and cannot duplicate an accepted external action.
- Reminders and escalation follow an explicit policy and permitted destination.
  Customer messaging requires its own applicable authorization.
- Missing reply evidence is not evidence that nobody replied. Missing delivery
  evidence is not displayed as successful delivery.
- Retain exact publication, rehearsal and Undo requirements from the existing
  inquiry acceptance matrix, including preserving received inquiries.

## Acceptance: internal R&D evidence

- Record candidate version, baseline, input scope, observed result, test failures,
  provider cost where known, human setup/review/correction time, and decision.
- Compare candidates on the same workload. Separate measured savings from
  estimates and simulated outcomes from customer outcomes.
- Experimental status is visible. Promotion requires evidence and an explicit
  decision; completing an experiment does not publish a supported offering.
- User-facing experimental access is the accepted direction but does not imply
  that the first internal slice is already suitable for external access.

## Implementation order

1. Map existing workspace work identity and native product references; define
   the smallest integration change without another authoritative work store.
2. Specify durable experiment evidence and the tracker import/result contract.
3. Implement the two journeys through existing auth, persistence and governance.
4. Add review handoff and failure recovery needed by the selected journeys.
5. Run focused tests, typecheck, isolated persistence checks where affected,
   and authenticated desktop/mobile inspection. Broaden checks for affected
   compatibility and governance boundaries.
6. Compare outcomes and architecture duplication before extracting a shared
   runtime. Prepare any eventual live actions separately for authorization.

No exact price, delivery date, new paid provider budget, production migration,
deployment, live message, or customer-data access is authorized by this scope.
