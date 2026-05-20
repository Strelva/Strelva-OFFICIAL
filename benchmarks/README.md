# Scaffold AI Benchmark

A real benchmark for the AI agent. Adversarial prompts run against the actual
agent surface; the evaluator grades observable behavior (tool calls,
governance routing, content state diffs, response content). Output is a
Markdown report you commit and diff between runs.

## Why this exists

The earlier `agent-benchmarks/` suite was deleted in May 2026 because it
graded its own reference fixtures — a tautology. This replacement runs the
real agent against real tenant content and checks what actually happened.

## What's covered

This v1 exercises `executeAgentPromptDetailed` from
`src/lib/agent-executor.ts`. Six tools are reachable:
`read_section`, `update_section`, `get_suggestions`, `create_suggestion`,
`create_blog_post`, `list_blog_posts`.

Cases live in `benchmarks/cases.ts`, grouped by category:

| Category | What it tests | v1 status |
|---|---|---|
| A — Factual | Hours, phone, email, address updates the owner expects to "just work" | ✅ Active |
| B — Numerical | Don't invent metrics — must call tools | ⏳ Pending (chat-route tools) |
| C — Multi-tool | Compound asks that need 2+ tools | ⏳ Pending |
| D — Schema | Tricky array edits, complete-data requirement | ✅ Active |
| E — Public action | Public-facing reply restraint | ⏳ Pending (chat-route tools) |
| F — Refusals | Off-platform asks (refunds, shipping, bookings) | ✅ Active |
| G — Ambiguous | "Fix it" — must ask, not guess | ✅ Active |
| H — Adversarial | Prompt injection, destructive commands | ✅ Active |
| I — Multi-turn | Context carry across turns | ⏳ Pending |
| J — Garbage | Empty / nonsense prompts | ✅ Active |

Pending categories require the chat route's wider toolset (newsletter,
social, reviews, metrics) wired into the harness. They're documented in
`cases.ts` so the v2 backlog is visible.

## Dimensions graded

Every check rolls up into one of these dimensions for per-dimension scoring:

- **Tool selection** — Did the required tools get called?
- **Tool restraint** — Did forbidden tools stay uncalled?
- **Governance** — Did `update_section` land in publish / review / block correctly?
- **State change** — Did the expected content fields change (live or queued)?
- **State restraint** — Did sections that should be untouched stay untouched?
- **Response content** — Substring assertions on the agent's text
- **Refusal / clarify** — Did the agent refuse or ask for clarification when it should have?
- **Judge (LLM)** — Tone / specificity / voice grading by a smarter model than the agent under test
- **Agent runtime** — Did the agent run without throwing?

## The LLM-as-judge layer

Deterministic checks can confirm what the agent did. They cannot grade
whether a refusal helpfully redirects, whether a blog post sounds
AI-written, or whether a clarifying question is actually useful. The judge
layer fills that gap.

A case with `judgeRubrics` declares one or more yes/no questions plus
criteria. After deterministic checks pass, the evaluator runs each rubric
in parallel through a stronger model (default: `gemini-2.5-pro`) using
`generateObject` for structured `{ pass, reasoning }` output.

Override the judge with:

```bash
BENCHMARK_JUDGE_MODEL=gemini-2.5-pro pnpm bench:agent   # default
```

(In the future, point this at a different model via the AI SDK
`provider/model` string format. The judge call uses `@ai-sdk/google`
today, so override values must be Google models. Cross-provider judging
would need a small adapter — left as a follow-up.)

**Cost.** Each rubric is ~$0.002 of Gemini Pro API spend. K1 has 3
rubrics, K2 has 2, plus single rubrics on A1, F1, G1, H1 — adds ~$0.02
to a full run.

**Where rubrics live in the report.** Each judge result becomes one
CheckResult in the `judge` dimension. The reasoning the judge produced
appears as the check's detail, so when a rubric fails you can see WHY
it failed without re-running.

## Running

```bash
# All active cases:
pnpm bench:agent

# Filter by case-id prefix:
pnpm bench:agent A          # A-category only
pnpm bench:agent A1 D2 F1   # specific cases
```

### Requirements

- `GOOGLE_GENERATIVE_AI_API_KEY` must be set. The benchmark makes real
  Gemini calls (~$0.001–$0.005 per case at `gemini-2.5-flash`). A full
  run of the 11 active cases is well under $0.10 of API spend.
- `pnpm install` has completed.
- No Sanity env vars need to be set. The runner explicitly unsets
  `NEXT_PUBLIC_SANITY_PROJECT_ID` and `SANITY_API_TOKEN` to force the
  dev-file storage path. The benchmark must never write to real Sanity.

### What the runner touches on disk

- **`dev-tenants.json`** — appends a `benchmark` tenant if missing.
  Existing tenants (gldf, rohlax, jacobtest, etc.) are preserved.
- **`dev-content-benchmark.json`** — written fresh before each case,
  removed at the end of the run.
- **`benchmarks/reports/bench-<timestamp>.md`** — the Markdown report.

## Interpreting the report

Each case shows:

1. The agent's text response
2. Every tool call in order (with errors if any)
3. Each check that passed or failed, with the reason

The aggregate at the top shows pass rate per dimension and per category.
Use this to find systemic problems — e.g. if `governance` is 30% but
`tool-selection` is 90%, the agent picks tools fine but the publish-vs-review
routing is broken (probably what you'll see for A-category on first run,
because today's `tenantAutoPublish=false` default forces everything into the
review queue).

Diff two reports across a system-prompt change to confirm regressions
or improvements:

```bash
diff benchmarks/reports/bench-<previous>.md benchmarks/reports/bench-<latest>.md
```

## Adding cases

1. Add a `BenchmarkCase` entry in `benchmarks/cases.ts`.
2. If you need new initial content, extend `benchmarks/fixtures.ts`.
3. Run `pnpm bench:agent <new-case-id>` to verify.

Each case declares:

- `prompt` — what the owner says
- `expectedTools.must` / `.forbidden` — which tools should / shouldn't be called
- `expectedGovernance` — `publish`, `review`, `block`, or `any`
- `expectedStateChanges` — sections that must / mustn't change
- `responseAssertions` — substring matching on the response

The cheaper checks are deterministic. Tone/quality assertions for copy
generation would need an LLM-as-judge layer — that's v2 work.

## Limitations to be honest about

- **Single-turn only.** Multi-turn context tests need the chat route.
- **Six tools.** The chat agent at `/api/agent/route.ts` has 21 tools.
  Newsletter, social, reviews, metrics, and image upload aren't testable
  through this harness yet.
- **No tone grading.** Copy-generation outputs (blog posts, drafts) only
  get substring assertions today. LLM-as-judge is a v2 add.
- **Storage layer is dev-file.** Real production uses Sanity. Behaviors
  specific to Sanity image transforms / GROQ aren't exercised here.

These limitations are real but the harness is still useful — the failure
modes most likely to bite the first paying customer (factual auto-publish,
refusal correctness, schema compliance, prompt injection resistance) all
fit inside the v1 surface.
