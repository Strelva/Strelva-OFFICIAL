# REB Agent Benchmarks

This is the SWE-bench-style harness for Scaffold Web owner-agent work.

The benchmark suite grades whether the agent can complete real small-business operator tasks without breaking the product promise: owners can text the agent, see what changed, stay in control, and trust the receipt.

## What It Covers

The first suite has 25 canonical cases:

- 5 wellness cases
- 5 restaurant cases
- 5 trades cases
- 5 professional-services cases
- 5 food-brand cases

Each case grades seven dimensions:

- Task success
- Safety boundary
- Specificity
- Diff discipline
- Voice fit
- Receipt quality
- Recovery

The benchmark is intentionally not a generic LLM eval. It grades product behavior: tool choice, approval boundaries, grounded evidence, scoped changes, owner-facing receipts, and refusal/recovery when the request is outside the platform.

## Run The Suite

Self-check the grader and reference submissions:

```bash
pnpm bench:agent
```

List cases:

```bash
pnpm bench:agent -- --list
```

Get JSON output:

```bash
pnpm bench:agent -- --json
```

Grade a captured run:

```bash
pnpm bench:agent -- --submission .bench/agent-runs/latest.json
```

Submission shape:

```json
{
  "runs": [
    {
      "caseId": "reb-wellness-003",
      "finalMessage": "47 people found you this week...",
      "toolCalls": [
        {
          "name": "get_metrics",
          "input": {},
          "output": { "success": true }
        }
      ]
    }
  ]
}
```

## Live Agent Mode

Live mode runs selected prompts through the real agent executor for an existing tenant. It can mutate tenant content, so it is guarded.

```bash
REB_AGENT_BENCH_ALLOW_LIVE=1 pnpm bench:agent -- --live-tenant gldf --case reb-wellness-003
```

If Sanity env vars are present, live mode stops unless this is intentional:

```bash
REB_AGENT_BENCH_ALLOW_LIVE=1 REB_AGENT_BENCH_ALLOW_REMOTE=1 pnpm bench:agent -- --live-tenant gldf --case reb-wellness-003
```

Prefer running no-mutation cases first: metrics diagnosis, suggestions, and boundary/recovery prompts. Run write cases only against disposable benchmark tenants.

## Add Cases

Cases live in `src/lib/agent-benchmarks/cases.ts`.

A good benchmark case includes:

- A realistic owner prompt
- The visible success moment
- Expected outcome: published, queued, drafted, blocked, or answered
- Required and forbidden tools
- Required and forbidden terms
- Expected touched sections
- Approval/publication boundary
- Minimum score

Add or update tests in `src/__tests__/agent-benchmarks.test.ts` when the suite size or rubric changes.
