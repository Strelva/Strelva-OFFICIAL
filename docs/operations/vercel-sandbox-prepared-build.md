# Prepared Vercel Sandbox build adapter — issue #334

Prepared October 7, 2026. This is an isolated proposal and local port proof, not
an installed dependency, provider qualification, spending approval, or release.
The existing Docker builder, custom-app freeze and iframe CSP remain selected.

## Concrete approval

Approve adding **`@vercel/sandbox@3.5.1`**, pinned exactly, and preparing a
dedicated nonproduction Sandbox project under a commercial Pro/Enterprise team.
Proposed first provider verification: **at most 100 isolated builds with a $1
total authorization**, no customer data, deploys, persistent storage or open
ports. Approval must identify the team/project and who pays. No account access,
remaining credits, credential readiness or available image has been verified.

The workspace instruction says **“Ask before adding a dependency.”** Issue
[#334](https://github.com/Strelva/Strelva-OFFICIAL/issues/334) explicitly requires
Jacob's dependency decision #237 and acknowledges Sandbox usage billing. The
optional adapter itself adds no package or provider action.

After approval, the exact dependency action is
`pnpm add --save-exact @vercel/sandbox@3.5.1`; review the manifest/lockfile,
transitives and package audit before use. The public registry identifies 3.5.1
as current, Apache-2.0 licensed, with 13 direct dependency entries. The actual
3.5.1 declarations were inspected through its public package distribution;
installation and compiler binding against that installed package remain unproven.
[Package metadata](https://registry.npmjs.org/@vercel/sandbox/latest),
[3.5.1 declarations](https://unpkg.com/@vercel/sandbox@3.5.1/dist/sandbox.d.ts).

## Provider choice and cost

The prepared request fixes `iad1`, one vCPU, a 30-second session, `deny-all`
egress, no environment credentials, no exposed ports, and `persistent: false`.
One vCPU provides **2048 MB**, compared with Docker's declared 256 MB; the
receipt reports the real VM limit. Node's 192 MB heap flag is not a 256 MB VM
or total-process memory guarantee. Accepting this footprint is a separate
contract decision. A server-approved VCR image digest containing Node, Bash,
Python and the Linux isolation helpers is mandatory. No digest is invented or
selected here. [SDK contract](https://vercel.com/docs/sandbox/sdk-reference).

Current default-region Pro rates are $0.128 per active CPU-hour,
$0.0212 per provisioned GB-hour and $0.60 per million creations. Memory has a
one-minute minimum; Pro use draws against its monthly credit and then bills.
For one fully CPU-active 30-second, one-vCPU build, CPU plus rounded memory and
creation are approximately **$0.001774** before transfer and image preparation.
This is a calculation from published rates, not a provider quote or hard spend
cap. Sandbox transfers are also billable under the plan's network rules.
[Current pricing](https://vercel.com/docs/sandbox/pricing).

Commercial use requires Pro or Enterprise; the Hobby allotment is not a
commercial deployment plan. [Fair use](https://vercel.com/docs/limits/fair-use-guidelines).

## Prepared implementation

`src/products/custom-applications/vercel-sandbox-build.ts` exports an optional
builder and the structural subset of the real 3.5.1 SDK it consumes. Its
configuration is server-owned. The gate defaults off at the integration owner;
there is no route, automatic SDK import or environment activation in this patch.

Admission must recheck the owning resource, exact application version/source
digest, current listed-source eligibility and accepted payer budget, and persist
the supplied deterministic attempt name **before** provider creation. The name
is unique to workspace/resource/version/source and stays the same on ambiguous
retry; the adapter never silently switches to a new VM name or resumes an old VM.
After dependency approval, the SDK binding is `{ create: options =>
Sandbox.create(options) }`. Deployment OIDC authenticates the caller; externally
hosted use requires explicit SDK token/team/project credentials, kept entirely
outside the guest. [Provider authentication and SDK](https://vercel.com/docs/sandbox/sdk-reference).

Source files are validated with the existing source/path limits and copied into
a fresh VM. Trusted setup moves them to `/source`, makes all directories and
files root-owned and read-only, and creates a separate user with no inherited
groups. Trusted setup attempts a 2 MB output tmpfs and 16 MB temporary tmpfs;
missing helpers or denied mounts fail the build. Untrusted execution drops to
that user, clears its environment, uses a 25-second kill deadline and limits
process count to 64 and file size to 2 MB. The VM's full filesystem is not
claimed to be read-only, and total memory/disk semantics differ from Docker.

Untrusted logs stay in guest tmpfs because the SDK internally accumulates
blocking command logs even when a Writable sink is supplied. The verifier
rejects more than 32 KB of logs and kills surviving build-user processes before
checking a regular, single-link HTML file. The artifact remains capped at
512,000 bytes, requires valid UTF-8 and uses the existing source/artifact digest
algorithm. No stdout marker authorizes an artifact. Trusted control-plane logs
are discarded and abort at the same cap; provider errors never become customer
instructions. The retained iframe policies remain the browser boundary.

All paths after successful creation call `stop()` with a fresh five-second
cleanup signal, even after user cancellation. Failed cleanup suppresses the
artifact and returns a safe operator lookup name; ambiguous creation also
requires operator verification. The 30-second provider timeout is the fallback,
not evidence that cleanup actually occurred. There are no snapshots or drives.

## Exact integration remaining

1. Approve and install the dependency; compile the real SDK binding. Approve or
   provision the digest-pinned image and verify its helpers, mount permissions,
   sudo policy, nonroot identity and filesystem behavior in the chosen project.
2. Persist build attempts, ambiguous creation/cleanup receipts and actual
   provider usage against the existing accepted budget. The current lifecycle
   economics path records `amountCents: 0`; do not wire a paid provider into it
   without metering/reservation/reconciliation.
3. Resolve the 2048 MB artifact contract deliberately. This prepared return type
   is intentionally incompatible with the current literal-256 MB lifecycle
   type; do not cast it or claim the old bound. Then inject the approved builder
   through `createCustomApplicationService(..., { build })` and retain admission
   rechecks. No default selection change is included here.
4. Implement exact custom listed-app runtime qualification before unfreezing.
   The creator registry currently qualifies closed native application,
   inquiry, website, offering and bundle behaviors. A Sandbox HTML build is
   byte-production evidence, not an exact source-revision behavior rehearsal or
   human listing approval. This dependency decision cannot substitute for that
   missing integration.
5. With explicit provider authorization, verify attempted source mutation,
   external DNS/HTTPS denial, process/log/output flooding, cancellation,
   timeout, failed cleanup, ambiguous creation and changed-revision admission.
   Verify preview desktop/mobile/keyboard under the unchanged iframe CSP.

## Local evidence

`src/__tests__/vercel-sandbox-build.test.ts` uses an injected SDK-shaped fake;
it makes no provider calls. Together with the retained custom build/CSP suite,
21 tests cover resource/digest binding, exact request shape, stable attempts,
disabled/denied admission, immutable input, command failures, missing/oversized
or invalid output, provider-image mismatch, logs, cancellation and cleanup.
Type checking, focused lint and trusted wrapper shell syntax checks pass.

These tests prove adapter decisions and failure handling. They do not establish
real VM isolation, blocked egress, mount availability, package installation,
provider billing, current access, custom listed-app runtime eligibility or
production behavior. Issue #334 remains open at those exact gates.
