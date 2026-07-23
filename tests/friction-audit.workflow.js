export const meta = {
  name: 'strelva-friction-audit',
  description: 'Friction pass over Strelva admin + client — what is overwhelming / rough / confusing for real users (not premium aesthetics)',
  phases: [
    { title: 'Find', detail: '2 Fable lanes: operator friction + client friction', model: 'fable' },
    { title: 'Verify', detail: 'triage each finding', model: 'fable' },
  ],
}

const DESK = 'tests/ux-shots/desktop'
const MOB = 'tests/ux-shots/mobile'
const pathsFor = (labels) => labels.flatMap((l) => [`${DESK}/${l}.png`, `${MOB}/${l}.png`]).join('\n')

const CLIENT = ['dash-today', 'dash-ask-strelva', 'dash-website', 'dash-content', 'dash-assets', 'dash-history', 'dash-google-business', 'dash-analytics', 'dash-reports', 'dash-reviews', 'dash-settings', 'dash-health', 'dash-integrations', 'dash-leads', 'dash-needs-you']
const ADMIN = ['admin-overview', 'admin-clients', 'admin-client-detail', 'admin-leads', 'admin-onboard', 'admin-analytics', 'admin-audit', 'admin-actions', 'admin-drafts', 'admin-digests', 'admin-ops', 'admin-pay-links']

const LENS = `You are auditing for FRICTION, not beauty. The visual polish pass is DONE — do NOT report aesthetic nitpicks (spacing, void, font choices). Report ONLY things that would make a real user feel OVERWHELMED, CONFUSED, ANNOYED, or MISLED. Specifically hunt for:
- Numbers/metrics that are meaningless or misleading for the actual data state (e.g. leading a brand-new client with weekly-engagement KPIs that are all zero; a count that contradicts the list under it; a "0%" or "never" presented as if it's a problem).
- NOISE: too many flags/alarms/badges for things that aren't real action items; the same fact repeated; walls of issues where 3 would do; a status screaming "warning/red" for a normal state.
- Jargon or debug/engineer language shown to the user (internal ids, "not configured", raw enum values, class names).
- Confusing or contradictory signals (two things disagreeing; an action that implies a state that isn't true; an empty state that reads as broken).
- Anything that would make an OPERATOR (Noah/Jacob, who live in the admin) slower or a CLIENT (who rarely logs in) feel lost.
Note: this is captured with a fresh/near-empty tenant (gldf), so sparse/zero states are exactly what to scrutinize. admin-client-detail may be a real new-client (rhm-innovations) detail — judge its new-client framing. Cite the exact screenshot path in every finding.`

const FINDING_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'findings'],
  properties: {
    summary: { type: 'string', description: 'One paragraph: how overwhelming/rough is this side for a real user right now?' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['surface', 'title', 'severity', 'kind', 'evidence', 'whyItAnnoys', 'fix'],
        properties: {
          surface: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          kind: { type: 'string', enum: ['misleading-metric', 'noise', 'jargon', 'contradiction', 'overwhelm', 'confusing-state', 'other'] },
          evidence: { type: 'string', description: 'Exact screenshot path + what is visible.' },
          whyItAnnoys: { type: 'string', description: 'Why a real operator/client would be confused/overwhelmed/misled.' },
          fix: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'reasoning', 'adjustedSeverity'],
  properties: {
    verdict: { type: 'string', enum: ['real', 'nitpick', 'wrong'] },
    reasoning: { type: 'string' },
    adjustedSeverity: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
  },
}

phase('Find')
const lanes = [
  { key: 'operator-friction', prompt: `Audit the Strelva OPERATOR CONSOLE (/admin) — the tool Noah + Jacob live in daily to manage clients. ${LENS}\n\nRead every admin screenshot (desktop + mobile):\n${pathsFor(ADMIN)}\n\nFind what makes the operator slower, confused, or staring at noise instead of the 2-3 things that actually need them today. Rank by how much it hurts daily use.` },
  { key: 'client-friction', prompt: `Audit the Strelva CLIENT DASHBOARD — seen by a local-business owner who rarely logs in and just wants proof it's working. ${LENS}\n\nRead every client screenshot (desktop + mobile):\n${pathsFor(CLIENT)}\n\nFind what would confuse, overwhelm, or mislead a non-technical owner (especially empty/first-run states, meaningless zeros framed as problems, jargon). Rank by how much it hurts.` },
]

const results = await pipeline(
  lanes,
  (l) => agent(l.prompt, { label: `find:${l.key}`, phase: 'Find', model: 'fable', schema: FINDING_SCHEMA }),
  (found, lane) =>
    parallel((found?.findings ?? []).map((f) => () =>
      agent(
        `Adversarially verify this FRICTION finding against the cited screenshot(s). Read the exact path(s) in its evidence and look. Is it REAL (a genuine overwhelm/confusion/misleading issue a real user would hit), a NITPICK (technically true but trivial or an aesthetic complaint in disguise), or WRONG (misreads the screen / already fine)? Default skeptical; "real" only if it genuinely hurts a real operator or client.\n\nFinding:\n${JSON.stringify(f, null, 2)}`,
        { label: `verify:${f.surface}`, phase: 'Verify', model: 'fable', schema: VERDICT_SCHEMA },
      ).then((v) => ({ ...f, lane: lane.key, verdict: v })).catch(() => null),
    )),
)

const all = results.flat().filter(Boolean)
const survivors = all.filter((f) => f.verdict?.verdict === 'real')
const rank = { high: 0, medium: 1, low: 2 }
survivors.sort((a, b) => (rank[a.verdict?.adjustedSeverity] ?? 3) - (rank[b.verdict?.adjustedSeverity] ?? 3))

return {
  totals: { raw: all.length, real: survivors.length, nitpick: all.filter((f) => f.verdict?.verdict === 'nitpick').length, wrong: all.filter((f) => f.verdict?.verdict === 'wrong').length },
  laneSummaries: lanes.map((l, i) => ({ lane: l.key, summary: results[i]?.[0]?.__laneSummary })).filter((x) => x.summary),
  survivors,
}
