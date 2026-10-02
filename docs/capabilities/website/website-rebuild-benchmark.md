# Website rebuild provider comparison

The [rebuild specification](website-rebuild-spec-2026-10-01.md) asks for a blind
Jev-versus-model comparison. The [benchmark runner](../../../scripts/website-rebuild-benchmark.ts)
prepares that measurement using public sources. It defaults to a dry run and
has not made a paid provider call.

Run the dry comparison:

```bash
pnpm exec tsx scripts/website-rebuild-benchmark.ts
```

The default input is the cached public Mooney homepage, verified against its
saved URL and SHA-256 receipt. This is one page, not the ten-page source spike.
Every lane receives the same extracted facts and page plan. `--crawl` uses the
existing bounded, robots-aware public crawler instead; `--source-html FILE
--source-url URL` uses a different cached public page. No tenant data is read.

The saved [dry-run comparison](../../../output/website-rebuild-benchmark-dry-run-final-2026-10-01/blind/index.html)
contains the rules result and two unexecuted provider lanes. Its
[private evidence](../../../output/website-rebuild-benchmark-dry-run-final-2026-10-01/private/evidence.json)
records zero admitted provider calls and zero model cost. It is preparation,
not a provider benchmark or evidence of design quality.

After Jacob explicitly approves paid calls and the existing Google and AI
Gateway keys are available in the process environment, the concrete command is:

```bash
pnpm exec tsx scripts/website-rebuild-benchmark.ts \
  --allow-paid-providers \
  --max-calls 12 \
  --confirm-public-source https://www.attymooney.com/
```

Do not put keys in command arguments. The runner does not read an env file or
change deployed configuration. The named paid flag and exact source assertion
admit sharing this public source with providers; they do not replace Jacob's
approval to spend money.

One admitted model writer result is shared by both paid composition lanes, so
copy differences cannot confound the Jev-versus-model comparison. The model
lane uses the existing model composer; the Jev lane uses the existing Jev
composer. Both use the existing Jev verifier on unsupported rendered copy and
the same two explicit verification probes: an exact source quotation and an
unsupported test claim. The rules reference uses original source copy and
exact-source verification. The unsupported probe is evaluation data only and
never enters the rendered website. Provider decisions and probabilities are
saved; agreement does not establish accuracy. Model composition confidence is
self-reported, not calibrated.

The global hard cap counts each admitted attempt, including primary/fallback
calls and failed or timed-out calls. It accepts 1–30 calls, caps provider inputs
at 250,000 bytes, limits writer output to 8,192 tokens and model composition
output to 2,048 tokens, and uses the existing bounded provider timeouts and Jev
response cap. A failed shared writer prevents both provider lanes from running.
Any failed or denied lane admission, failed verification probe or composition
fallback marks that lane incomplete and makes a paid run exit nonzero. A low
call cap can therefore stop a run before the comparison finishes.

Actual paid dollar cost is **unknown**: the current factory interfaces do not
return billing receipts, and the runner cannot enforce a dollar budget from
estimates. The enforced limit is calls, not money. No tenant cost-governor or
production records are written. Provider errors are reduced to fixed failure
categories; credentials and response error bodies are not saved.

Each fresh output directory contains `blind/` and `private/`. Serve only
`blind/` to an independent judge. It contains randomly assigned A/B/C previews
and an unfilled judge sheet. The private directory is restricted to the local
owner and contains the provider key, call records, source hashes, timing,
verification decisions, site documents and HTML-only audit results. Judges
record their preference and corrections before seeing the provider key.
`--seed PRIVATE_SEED` makes label assignment reproducible; never share the
seed or private directory before assessment. Preview forms are disabled.

This command does not publish a site, upload media, send inquiries or email,
write calendars, change DNS, deploy, or operate a tenant. A human assessment,
actual billing evidence, the spec's kill-rule decision and production proof
remain separate acceptance steps.
