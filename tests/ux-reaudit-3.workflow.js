export const meta = {
  name: 'strelva-ux-reaudit-3',
  description: 'Third Fable vision UX pass on Strelva — verify wave A-D fixes landed + rank what remains',
  phases: [
    { title: 'Find', detail: '4 Fable vision lanes over fresh post-fix screenshots', model: 'fable' },
    { title: 'Verify', detail: 'adversarial triage of every finding', model: 'fable' },
  ],
}

const DESK = 'tests/ux-shots/desktop'
const MOB = 'tests/ux-shots/mobile'
const pathsFor = (labels) => labels.flatMap((l) => [`${DESK}/${l}.png`, `${MOB}/${l}.png`]).join('\n')

const CLIENT = ['dash-today', 'dash-ask-strelva', 'dash-website', 'dash-content', 'dash-assets', 'dash-history', 'dash-google-business', 'dash-analytics', 'dash-reports', 'dash-reviews', 'dash-settings', 'dash-health', 'dash-integrations', 'dash-store', 'dash-roster', 'dash-schedule', 'dash-members', 'dash-leads', 'dash-needs-you']
const ADMIN = ['admin-overview', 'admin-clients', 'admin-client-detail', 'admin-leads', 'admin-onboard', 'admin-analytics', 'admin-audit', 'admin-actions', 'admin-drafts', 'admin-digests', 'admin-ops', 'admin-pay-links']
const CHANGED = ['dash-reports', 'dash-analytics', 'dash-integrations', 'dash-reviews', 'dash-leads', 'dash-needs-you', 'dash-google-business', 'dash-today', 'dash-settings', 'admin-overview', 'admin-analytics', 'admin-ops', 'admin-leads', 'admin-drafts', 'admin-digests', 'admin-clients', 'admin-audit', 'admin-onboard']
const COHERENCE = ['dash-today', 'dash-analytics', 'dash-reviews', 'dash-integrations', 'dash-settings', 'admin-overview', 'admin-clients', 'admin-audit', 'admin-ops', 'admin-leads']

const BAR = 'The premium bar is Linear/Stripe/Vercel dark-console execution fused with Strelva brand warmth (a confident serif display face, ONE sage accent, warm plain-English voice). Judge finish, not features.'

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['laneSummary', 'grade', 'findings'],
  properties: {
    laneSummary: { type: 'string', description: 'One paragraph: how premium is this area NOW, and did the fixes land.' },
    grade: { type: 'number', description: 'Current premium grade for this lane, 1-10.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['surface', 'title', 'severity', 'category', 'evidence', 'problem', 'fix', 'effort'],
        properties: {
          surface: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          category: { type: 'string' },
          evidence: { type: 'string', description: 'Cite the EXACT screenshot file path(s) you read and what is visible.' },
          problem: { type: 'string' },
          fix: { type: 'string' },
          effort: { type: 'string', enum: ['small', 'medium', 'large'] },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'reasoning', 'adjustedSeverity'],
  properties: {
    verdict: { type: 'string', enum: ['real', 'nitpick', 'wrong'] },
    reasoning: { type: 'string' },
    adjustedSeverity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'] },
  },
}

const WAVES = `Wave A-D fixes to VERIFY landed (flag any that did NOT land or regressed):
- Reports no longer re-renders Analytics' connect stack / site-health / 90-day milestone; first-run Reports = explainer + ONE quiet "Connect Google" nudge; its section eyebrow reads "Your weekly report", not "Analytics".
- Analytics shows ONE unified "Connect Google" card, not two stacked.
- Sidebar connect state is a small sage DOT on Google Business only (Reviews has NO CONNECT badge); the "Google Business" label no longer truncates to "Google Busine…".
- Integrations: ONE row per integration (Google Business appears ONCE, not 3x), a single honest "N of M connected" count, plain-English status ("Not connected yet" / "Needs a quick manual step"), NO disabled "Connect first" button, and a single "Recommended first" hero.
- First-run void filled: Reviews / Leads / Needs You / Google Business center their content in the viewport instead of a small card over black.
- Admin Overview: NO "Recent signups" panel, NO stray second "+ New Client", Mission Control collapsed + BELOW the queue, $0 MRR neutral (not amber), calm data note (not a full-width amber alarm).
- Admin analytics all-zero = ONE "No site trackers reporting yet" card (not five "NO DATA / is the tracker installed?"); footer reads "Not configured yet", not "saved never".
- Admin Ops: three-state verdict ("Not fully configured") instead of a green "All clear" beside unconfigured deps.
- Admin Leads / Drafts / Digests use a designed empty card (icon tile + title + body), not a bare caption floating in a void.
- Serif display on Needs You / Leads / Ask Strelva page titles; mobile tab reads "Ask" (not "Ask Str…").`

phase('Find')
const lanes = [
  {
    key: 'verify-changed',
    prompt: `You are a senior product designer verifying a UX fix wave on the Strelva dark client dashboard + operator console. ${BAR}\n\nRead these screenshots (desktop + mobile widths):\n${pathsFor(CHANGED)}\n\n${WAVES}\n\nFor EACH claimed fix: confirm it visibly landed, OR file a finding if it did not land / regressed / is only half-done. ALSO file any NEW premium-blocking issue you see on these surfaces. Put the exact screenshot file path in every finding's evidence.`,
  },
  {
    key: 'client-remaining',
    prompt: `You are a senior product designer auditing the Strelva client dashboard (owner-facing, dark). ${BAR}\n\nRead every client screenshot (desktop + mobile):\n${pathsFor(CLIENT)}\n\nFind everything still keeping this below a 9/10: void/vertical-composition, empty states, hierarchy, spacing, copy/voice, mobile defects, inconsistency, any broken or confusing surface. Rank by severity; cite exact shot paths.`,
  },
  {
    key: 'admin',
    prompt: `You are a senior product designer auditing the Strelva operator console (/admin, dark). ${BAR}\n\nRead every admin screenshot (desktop + mobile):\n${pathsFor(ADMIN)}\n\nFind everything still keeping this below a 9/10: zero/empty states, status-color discipline, hierarchy, redundancy, jargon/debug voice, broken surfaces, mobile. Note that admin-client-detail may 404 in local capture (fixture id) — judge only if it renders. Rank by severity; cite exact shot paths.`,
  },
  {
    key: 'coherence',
    prompt: `You are a design-systems lead judging whether Strelva reads as ONE premium product across BOTH consoles. ${BAR}\n\nRead this cross-section (desktop + mobile):\n${pathsFor(COHERENCE)}\n\nJudge cross-surface coherence: button/select/eyebrow/serif consistency, one empty-state system, one connection-state pattern, spacing rhythm, status-color discipline, voice. Call out where surfaces diverge and read as different authors. Rank by severity; cite exact shot paths.`,
  },
]

const results = await pipeline(
  lanes,
  (l) => agent(l.prompt, { label: `find:${l.key}`, phase: 'Find', model: 'fable', schema: FINDINGS_SCHEMA }),
  (found, lane) =>
    parallel(
      (found?.findings ?? []).map((f) => () =>
        agent(
          `Adversarially verify this UX finding against the cited screenshot(s). Read the exact file path(s) named in its evidence and look. Is it REAL (a genuine premium-blocker at the Linear/Stripe/Vercel bar), a NITPICK (true but trivial), or WRONG (misreads the screen / already fixed)? Default skeptical — only "real" if you can see it and it materially hurts the premium feel.\n\nFinding:\n${JSON.stringify(f, null, 2)}`,
          { label: `verify:${f.surface}`, phase: 'Verify', model: 'fable', schema: VERDICT_SCHEMA },
        )
          .then((v) => ({ ...f, lane: lane.key, verdict: v }))
          .catch(() => null),
      ),
  ),
)

const all = results.flat().filter(Boolean)
const survivors = all.filter((f) => f.verdict?.verdict === 'real')
const nitpicks = all.filter((f) => f.verdict?.verdict === 'nitpick')
const wrong = all.filter((f) => f.verdict?.verdict === 'wrong')

const rank = { critical: 0, high: 1, medium: 2, low: 3 }
survivors.sort((a, b) => (rank[a.verdict?.adjustedSeverity] ?? 4) - (rank[b.verdict?.adjustedSeverity] ?? 4))

return {
  totals: { raw: all.length, real: survivors.length, nitpick: nitpicks.length, wrong: wrong.length },
  survivors,
  nitpicks: nitpicks.map((f) => ({ surface: f.surface, title: f.title })),
}
