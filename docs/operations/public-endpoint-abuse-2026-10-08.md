# Public endpoint abuse — October 8, 2026

Private runtime source: `6f487337` on `test/397-public-abuse-20261008`, based on
release source `3f3eac4f`. This is preparation for #397, not hosted qualification.

The lead beacon previously admitted every request when the shared rate limiter
failed. Its existing per-process fallback now admits at most 20 requests per
tenant/address fallback window. Normal requests still use the shared Redis
limiter. Healthy/outage transitions use separate counters; this is deliberately
weaker than an unconditional distributed 20-per-minute ceiling. The visitor can
still submit during an outage; refused requests retain the existing 429 body
and CORS contract.

## Repeat the local check

```bash
pnpm check:public-abuse
```

Requires existing `redis-server`; no new dependency is installed. The suite owns
a socket-only Redis with persistence disabled and an ephemeral loopback HTTP
listener. It never accepts ambient Redis/Postgres URLs or starts Docker or Next.
The native booking, capture, tenant and delivery ports are fictional. Ordinary
unit runs explicitly skip the Redis suite; the declared command enables all 16
cases. The five outage/regression cases also run in ordinary unit CI.

## Evidence

- 16 dedicated cases pass, including 8,078 measured burst requests at maximum
  concurrency 24. Additional probes cover independent tenants/providers, TTL
  repair and fixed-window retention, and malformed/oversized/spam requests.
- Shared OpenAI and Anthropic source fixtures each admit 240 independent reads.
  Ordinary-IP, business, provider, declared-agent and platform quotas refuse the
  excess. Platform/alias reads and MCP/REST holds share their relevant quotas;
  Gmail/plus aliases cannot bypass the mailbox cap. Confirmation remains required
  in the fictional successful booking receipts.
- 80 lead attempts during Redis failure: 20 admitted, 60 refused. The original
  unbounded catch was restored temporarily in this isolated checkout: all three
  initial regression tests failed, then passed with the fix. Two additional tests
  prove fallback expiry and return to the shared limiter after recovery.
- 81 focused route/protocol/inquiry tests, 84 starter contract tests, typecheck,
  scoped lint, boundaries and 196 sibling compatibility checks pass. Sibling
  checks use existing local repositories, not clean pinned release checkouts.
- Independent review found no blocker in the examined runtime change and 19/19
  cases passed independently before the two additional fallback cases. Its
  executable-bit finding is corrected. Queue-time limits are explicit below.

Receipts and original failures remain under `.scratch/public-abuse/` in the
private checkout. `receipt.json` records source, artifact sizes and SHA256 values.
Initial unbounded HTTP-fixture concurrency caused six socket-reset failures;
the corrected fixture uses 24 simultaneous sockets without retrying failed
requests. The first typecheck and lint errors are retained separately. An initial
client inventory omitted siblings; the later 196/196 inventory includes them.

Latency samples begin when a request obtains a fixture socket slot, excluding
the semaphore queue. They measure local transport/handler behavior with mocked
effect ports; they do not establish production capacity, SLOs or customer demand.

## Still required for #397

Run an explicitly authorized isolated hosted campaign through actual ingress,
proxy and native stores. Qualify sustained load, distributed limits, slot/lead
durability, delivery, provider confirmation, recovery and agreed thresholds.
This local receipt neither activates the identity-limit flag nor authorizes
production/provider changes. #397 remains open.
