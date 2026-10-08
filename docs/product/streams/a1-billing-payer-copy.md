# Business billing names the payer (#496)

Prepared and verified locally on October 8, 2026 for a draft pull request.
No hosted read, payment change, provider call, migration or deployment was
performed by this work.

## Contract and scope

[Issue #496](https://github.com/Strelva/Strelva-OFFICIAL/issues/496) asks the
billing page to stop assuming Strelva bills every client directly. The payer
party projection already landed with
[batch 7A / #517](https://github.com/Strelva/Strelva-OFFICIAL/pull/517):
`20261009154000_payer_party.sql` separates `payerParty` (business or agency,
workspace ID and name) from `payer` (the billing recipient).

This slice validates that existing projection and shows the recorded business
or named agency. A missing or null party remains unknown; a recipient name or
email is never substituted. Invalid party metadata fails the existing billing
read, rather than showing a guessed payer.

The displayed monthly and per-site amounts, payment status, paid-through date
and grandfathered agreement text still come directly from the existing read.
The amount is labelled as the recorded Strelva amount; agency copy does not
claim that it is the agency's separate customer bill. Empty billing and site
records no longer name Strelva as the business's service provider.

The unscoped `/dashboard/settings#plan` link is removed for every payer state.
On the control-plane host it lacks the selected business/tenant identity and
can fall back to the default tenant. No replacement payment destination is
invented from the first covered site. Payment changes remain with the recorded
party's existing billing arrangement; the workspace-scoped return link stays.

This is page-only composition using the existing Card and tokens. No shared
component, price, payment path, membership, SQL authorization or release flag
changes. The remaining #278 allowance/entitlement and payer-transition UI work
is outside this slice.

## Source and recovery

The current candidate is based on `release/security-runtime-20261007` at
`e9ac136f9a0eecf362421c4046a333f0c20496fd`. The affected billing source paths
were unchanged between the initial integration base (`f3097dd6`) and this
combined release. Open PR file lists were checked before implementation; no
competing billing implementation was found. #326 and #482 ownership remains
untouched, and no existing migration is edited or reintroduced.

An executor/volume change made the original shared checkout and logs
unavailable. This candidate was reconstructed from the retained task context
onto the exact release source and immediately backed up privately as a patch.
Historical passes on the original checkout do not verify this reconstruction.

## Verification state

Fresh verification on the reconstructed exact `e9ac136f` candidate:

- **54 tests in five focused files passed**, including 26 new billing
  read/page cases plus existing billing and payer-transition tests.
- **Full ESLint passed** (`eslint .`, 1 GiB heap).
- **Type checking passed** (`next typegen` followed by `tsc --noEmit`,
  4 GiB heap).
- **Product boundaries passed**: 202 workspace-to-`src/lib` imports in
  92 files and 43 older boundary imports. No baseline edits were needed.
- **`git diff --cached --check` passed**.

Dependencies came from the release's exact frozen lockfile: Next 16.3.8,
TypeScript 5.9.3, Vitest 4.1.11 and ESLint 9.39.4. Checks used the locally
installed executables; no production service was contacted.

The original checkout's passes are historical only; all results above were
reproduced after reconstruction. Read-only review found the unscoped settings
link; it was removed, and the final review reported no blocking finding.

## Remaining proof

Desktop/mobile, keyboard and navigation browser proof is **not established**.
The original local fixture imported the actual async billing page, inherited
workspace loading component, Card and app CSS, with fictional actor and billing
reads. It was not an authenticated or production billing journey, and its
local files became unavailable with the original shared volume.

The local Chromium attempt failed creating its Unix socket (`EPERM`), including
an approved escalated attempt. The supported cloud browser then rejected the
loopback fixture with `ERR_BLOCKED_BY_CLIENT`. No public tunnel or fixture
publication was created. Finish rendered proof in an approved preview-capable
environment before treating this UI issue as fully accepted.

No full unit suite, production build, SQL replay, hosted billing read or live
payment journey is claimed by this slice.
