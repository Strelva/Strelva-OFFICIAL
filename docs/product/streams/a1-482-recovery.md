# #482 recovered release candidate

Base: `release/security-runtime-20261007` at
`e9ac136f9a0eecf362421c4046a333f0c20496fd`.
This candidate reconstructs the local #482 work after the executor's shared
filesystem reset. It is not a deployment or authorization to publish remotely.

## Retained scope

- Four workspace consumers use the existing shared public-text transport; AI
  Visibility also imports the shared URL validator directly.
- The import baseline shrinks from 202 imports in 92 files to 197 in 89, with
  the 43 older product-boundary entries unchanged and no new exception.
- Delivery notices are split by concern behind their existing public exports.
  The current shared sender continues to own audience, tenant and provider gates.
- Compatibility, fetch-safety, sender-output and failure-path tests are retained.

The shared transport, URL validator, legacy exports, schema-conflict caller and
its route-test mock are already present in the base. Those six files remain
byte-identical to the base and are not claimed as new work. The current sender,
owner-recipient handling, package/lockfile and Next configuration are also
preserved. This includes the resolved sending-domain provider check and the
upstream Next 16.3.8 / jsdom 26.1.0 dependency graph.

## Recovery fidelity and verification

The remaining fetch edits and safety tests were reconstructed from their retained
instructions and exact patch hunks. The complete original 11-file delivery patch was recovered exactly: its
SHA-256 remains `d3d7e7e1b080ec751d45d83b29cc1daecce4200d356628d5f9b049cfe7eda2c5`.
The retained extraction script and 155-line parity test regenerated all 30 golden
snapshots against the untouched unsplit base before the split was reapplied.
This reproduced the original snapshot bytes and source, not merely similar output.
A historical-record notice was then added to its handoff in this combined candidate. The previously
observed result was 650 tests passed, one intentional skip, plus full lint,
typecheck and boundary checks. Those results are historical until the final
reconstructed candidate is checked again.

Fresh verification of the final reconstructed candidate:

- Frozen-lockfile dependency installation passed without changing the upstream
  manifest or lockfile.
- The combined focused suite passed: **45 files, 650 tests, one intentional
  PostgreSQL booking-store skip**. The 30 original snapshots pass unchanged.
- All 37 delivery-email declarations match the base after normalizing only the
  internal helper export modifier. The delivery worker also ran the same 116
  parity tests successfully against both unsplit and split source.
- Full ESLint and Next route generation plus full TypeScript passed, each with
  a saved exit status of 0. TypeScript used a 4 GB Node heap.
- The boundary checker passed at 197 imports / 89 files / 43 older entries.
- All six already-landed fetch paths, the current sender, owner-recipient and
  upstream dependency configuration remain byte-identical to the exact base.
- `git diff --check` passed.

The recovery artifact has its own identity; its complete bytes are not asserted
to match the lost consolidated patch because its documentation was consolidated.
The entire original delivery patch, including golden snapshots, was verified
byte-identical before the added historical-record notice. Historical stream
documents are not required to restore runtime behavior.

No SQL migration, production build, browser journey, provider write or live
email is part of this recovery. #482 specifies baseline shrink and a delivery
email split, with no zero-baseline target. The remaining imports are explicit
architecture debt.
