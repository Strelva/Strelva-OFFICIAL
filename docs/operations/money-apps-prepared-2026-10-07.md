# Money and agents/apps private implementation — October 7–8, 2026

This work follows payer transitions → agency billing → Connect/payment ledger →
splits/payouts and MCP/auth → creator qualification → listing/install → recurring
responsibilities. Five parallel implementation lanes were combined from pinned
base `cdf5c31a10085b949c2ab25045f0d5dd4d270cb6` in private branch
`build/money-apps-combined-20261007`, worktree `/tmp/strelva-money-apps-combined`.
It is unmerged and not approved for production. No outside write, paid provider
operation, distribution submission or new commercial promise is authorized.

The workspace local issues and retained acceptance bodies are the completion
owner: `/Users/jacobrhinehart/Desktop/strelva/.scratch/agency-1.0/money-apps-2026-10-07/`.
`status.md`, per-issue evidence and `receipts/` distinguish verified local behavior
from provider, policy, adoption and economics. Do not infer GitHub closure from
these local records. `REB/PRODUCT_MODEL.md` in the main workspace remains the
canonical model; this isolated checkout does not create another model.

## Implemented boundaries

Payer authority is a current business/agency party; historical signatures remain
history. Agency invoices retain exact independently accepted terms, and verified
provider observations must match account/object, amount, currency, customer and
subscription before advancing payment/activation clocks. Signed webhook routing
keeps platform, agency direct billing and business merchant sources distinct.

Financial history preserves original charge/invoice/install/source provenance.
Losses, reversals and restored entitlement are separate immutable rows. Current
net settlement, verified fees, source capacity and accepted terms bound payout
reservations and recovery generations. Unknown/countered-fee profiles fail closed.
Cron plans are dry-run; a flag cannot authorize a first transfer. Business exports
exclude credentials and payment/status capabilities; outgoing agencies receive
only their own definitions and an export receipt, not client data.

One MCP shares native tools and thin aliases. OAuth uses exact resource/redirect/
PKCE/current grants, with agency tokens scoped to agency×business. Public reads
use owner-confirmed facts; inquiry and quote intake retain opaque status tokens,
spam controls and idempotency. Booking confirmation has independent per-business
consent and a release switch; owner/reminder consent is not borrowed.

Creator/source/install identity is immutable. Each source revision has a behavior
declaration, native rehearsal, current human qualification and per-business owner
review. Bundles atomically create three isolated native component drafts, then
use each domain's existing review and verified release. Generic Make real cannot
publish Inquiry or website components. Accepted readback must match the exact
prepared native change. Revocation, stale baselines and foreign receipts refuse
release. Existing facts/assets/customer records remain local.

Recurring checks require an accepted mandate and current responsible provider.
Proof distinguishes verified, unverified, held, failed and missing receipts.
Responsibility meter observations are immutable daily as-of previews grouped by
month, never hours, final historical usage or priced Stripe billing.

## Required local proof commands

Use existing lockfile dependencies; do not install the proposed Sandbox SDK.
Stop the owned development server before route generation/build. PostgreSQL
checks create throwaway clusters and never use production credentials.

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm check:boundaries
pnpm check:ontology
pnpm build
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
```

Both SQL runners execute `scripts/sql/money-apps-contracts.sh` after their retained
caller/upgrade/rollback proofs. It generates private native builder input per
cluster, tests real commands/receipts, and scans all public reader call graphs for
row locks. Keep the existing public-key ACL test and exact catalog rollback hashes.
The staged runner applies the real historical delivery and internal-helper ACL
prerequisites; omitting them is not a source permission exemption.

Focused populated creator history, qualification writer/revoke races, payout
capacity races and independent settlement/native scope probes have separate
receipts. Local browser fixtures use actual components at desktop/mobile sizes;
fictional states and real signed-out denials are not live merchant/provider proof.

## Conditions before promotion

Reserved #232/#235/#236/#237/#240/#323/#324 decisions remain unselected unless
Jacob explicitly supplies them. Liability/Connect profile, notification scope,
prices/shares/royalties/fees, switching/proration policy and reviewer authority
cannot be seeded from fixtures. Existing prices and live grandfathered paths stay
under their existing authority. Real merchant/KYC, inline fee profile, settlement,
refund/recovery/payout, GBP access and native assistant interoperability need
separate authorized operational proof. No issue record grants that authority.

#311 legal/support/publication facts and directory submissions remain held.
#334 has an optional prepared Sandbox port, not an installed SDK or selected build
path: see [the concrete dependency/resource proposal](./vercel-sandbox-prepared-build.md).
The proposed SDK minimum2GB conflicts with the existing literal256MB artifact
contract. Dependency/resource approval, durable usage evidence, approved image,
listed custom-runtime qualification and actual provider isolation/cleanup proof
must be established before unfreezing it. No spend cap is inferred from a proposal.

Next: use the exact final source/proof manifest and issue gates in the workspace
completion record. Review prepared work before choosing values or authorizing a
bounded outside proof; do not deploy this branch as a consequence of local checks.
