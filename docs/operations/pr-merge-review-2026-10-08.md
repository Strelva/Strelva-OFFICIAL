# October 8 backlog merge review

## Objective and release boundary

Review and merge the recent engineering backlog, then continue bounded issue work.
PR #602 was independently reviewed and merged into `release/security-runtime-20261007`
at `f8f40569125d7dbc8ecc884345af38b45b72a3d9`. It integrates #591–596 and
#598–600. The follow-up integration preserves the actual histories of #585–590
and #597 and carries the two-file owner-recipient fix from #583.

This is source integration. No production migration, deployment, flag activation,
provider write, payment mutation, commercial commitment or human qualification
was performed. The independently frozen launch candidate remains a separate
comparison. Do not apply either candidate's prepared migrations implicitly.

## Integration repairs

- Preserve platform-owned booking/operator delivery from #598 while retaining
  #586's remaining concern split and shared canonical sent-activity logging.
- Preserve every existing batch-12 migration pin, admit earlier declaration work
  chronologically, and allocate additive pending batches 13–16. Qualification
  evidence remains pending the human policy decision; no new gate activates.
- Add readiness sentinels for qualification and website fact mapping tables.
- During historical rollback recovery, temporarily unwind the unused fact mapping
  successor before the older reader/trust batch, then replay it. Preserve the full
  catalog comparison. New native declarations are reflected in read-only fixtures.
- Scope the browser mapping error assertion to the actual region rather than the
  framework announcer.
- Extract the existing billing presentation into an owned view, retain route gates,
  and exercise business/agency/unknown/grandfathered/empty/error/denied fixtures
  at 1440 and 390 pixels, including actual scoped back navigation.
- When service currentness lookup or stale-save fails, display Exploring with a
  retry reason. Preserve exact saved candidate pins/history; confirm on a later
  read. Existing SQL activation authority is unchanged.

## Evidence

Source `004b7e5b` plus documentation-only correction:

- Unit suite: **9,032 passed; 51 skipped**, 923 files passed and 3 skipped.
- Typecheck, lint, boundaries and ontology passed. Boundary baseline is now
  **194 workspace-to-lib imports in 88 files**, with 43 older imports retained.
- Production build passed with empty provider configuration; high-level dependency
  audit passed under the existing exception for `GHSA-vfj7-8cjw-p6xm`;
  one high-severity advisory remains ignored by the existing repository policy.
- Complete ordered upgrade passed, including final declaration owner/actor
  authority and two-actor payer accept/reject races.
- Workspace SQL aggregate passed; qualification writer quarantine/rollback/reapply
  and real read-only checks also passed separately.
- Browser checks: hold-ratio states desktop/mobile, native mapping states and mobile
  errors, payer preview, and billing's seven states desktop/mobile passed with no
  retries. Representative saved screenshots were visually inspected.
- Both independent standards and specification reviews found no concrete blocker
  across the integration and the final presentation/currentness delta.

Initial failures are retained in the local review logs: missing readiness sentinel,
ambiguous alert selector, historic catalog recovery overwritten serializer, and
missing declaration in the ordered read-only fixture. Each repair has passing
focused or complete rerun evidence. Local paths are `/tmp/strelva-pr-merge-*-20261008.log`.

## Limits and next action

#496's billing copy and navigation are implemented and locally qualified. #310's
alarm portion is implemented, but the broader hardening issue remains open and its
threshold is provisional. #278, #327, #457 and #482 retain their broader scope;
no completion of human qualification, commercial payer migration, all import debt,
or production fact propagation is implied.

Continue with the remaining issue acceptance criteria from the nearest owner.
The older main-target #545 is blocked by its hosted dependency/build failure and
must not bypass that failure. Historic main/design PRs require separate comparison
against today's release and accepted product decisions.
