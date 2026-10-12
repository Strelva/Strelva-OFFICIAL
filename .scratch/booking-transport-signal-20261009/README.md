# Booking transport and cleanup signal correction

Complete corrective descendant of frozen 864c2d5cb8dd1a4ce0a8ef46d23822e376c603d3, preserving its composition on 844fb5f59a7296274ead84082fc05e0e3628a637. Independent review and native PostgreSQL qualification remain pending. No runtime lease, provider access, production writes, new dependency, or root checkout edits.

## Findings and correction

Independent review found that observation stripped inherited PG settings while mutation and cleanup retained them. Every observed, action, background, and cleanup psql invocation now uses the same transport shim, which removes every inherited PG variable and sets finite trusted connection/query limits. Background row-lock controls explicitly set their trusted longer SQL timeout. Fictional hostile PGHOSTADDR/service/servicefile/passfile/options cannot select another transport.

The actual SIGTERM reviewer witness exited 143 while a tracked child remained alive. Atomicity cleanup now retains protected INT/TERM traps, defers termination until tracked child closure and cleanup attempts finish, preserves the first signal status, and refuses PASS qualification on any terminal signal or cleanup failure. The actual helper PID is captured portably on macOS Bash 3.2; receipt ownership still uses the original caller PID.

## Evidence

- Actual frozen 864 hostile-environment control failed: helper returned zero while action SQL retained fictional hostile PG settings. Temporarily restored predecessor bytes were restored in finally; the frozen checkout was untouched.
- Original independent environment witness: /private/tmp/strelva-booking-864-review-jdg0gf8k/env-witness/receipt.json.
- Original independent actual signal witness: /private/tmp/strelva-booking-864-review-jdg0gf8k/signal-witness/receipt.json. Helper exited 143, child remained alive; reviewer closed only its recorded harmless child.
- Corrected transport/signal suite: 9 PASS. Includes hostile defaults and actual SIGINT/SIGTERM at body, cleanup query, child closure, and fixture deletion boundaries. Recorded live children were gone before terminal helper exit; first signal status 130/143 retained; no PASS cleanup on signal; fake fixture absent.
- Final sequential owned-cluster/atomic guard suite: 30 PASS, session 32301, after predecessor RED restoration. Earlier overlapping receipt is not relied upon.
- Scoped lint, Bash syntax and diff checks passed. Initial Bash BASHPID and lint failures were corrected before the final source controls.
- All 589 predecessor migration files compared byte-for-byte, zero changed. Forward SQL SHA256 remains 6497dd7346ce3f9e9e77409b5fc933871ac931dc266e792dd4806ffcf0b07ce6. No historical SQL or inquiry-budget edits.

These are actual Bash/Node process and fake psql controls, with no PostgreSQL or network connection. They do not prove native catalog identity, PostgreSQL backend closure, functional RPC/concurrency, Auth, typecheck, deployed state, or the root migration count. Root's earlier minimal corrected creation-ACL witness remains limited to that witness.

## Resume

Root owns independent review, final composition, migration registry, full typecheck/build and all native/browser leases. Latest root update says browser 45 closed with 43 PASS and two new Needs failures, root runtime inactive, Creator corrections and actual 351 registry companion preparing; no broader qualification inferred.

Review this entire descendant, then root may execute the existing owned private-cluster sequence under its exclusive lease: initialize a fresh private cluster in the same parent shell, seal its actual PID/birth/system identifier/data/socket/catalog receipt, verify hostile defaults, functional SQL and both concurrency orders, guarded inverse identity and forward authority controls, inverse/reapply. Preserve every failure and terminal cleanup receipt; confirm owned postmaster closure before deleting its data. Refuse foreign baseline clients or receipt drift. Do not use a shared or borrowed runtime.
