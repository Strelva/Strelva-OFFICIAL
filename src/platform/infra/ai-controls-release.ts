/**
 * Release switches for per-client usage controls and the list-price billing
 * ceiling. Env-only and off unless set to "1"; nothing here reads a database.
 */
type Env = Record<string, string | undefined>;

/** Per-client pause, monthly limit and review-reply hold (enforcement, routes, screens, owner lines). */
export function aiControlsReleaseEnabled(env: Env = process.env): boolean {
  return env.STRELVA_AI_CONTROLS_RELEASE === "1";
}

/** Configured priced models get a list-price billing ceiling, so capped calls run until the cap. */
export function listPriceCeilingEnabled(env: Env = process.env): boolean {
  return env.STRELVA_AI_LIST_PRICE_CEILING === "1";
}

/** Either feature reads business_ai_budget_v2 and reserves through reserve_business_ai_budget_v2. */
export function businessAiBudgetV2Enabled(env: Env = process.env): boolean {
  return aiControlsReleaseEnabled(env) || listPriceCeilingEnabled(env);
}
