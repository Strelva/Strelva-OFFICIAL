import type { ContentMap, ContentSection } from "./types";
import { gldfContentDefaults } from "./gldf-content-defaults";
import { demoContentDefaults } from "./demo-content-defaults";

/**
 * Per-tenant content defaults.
 *
 * When a tenant has no stored row for a section, resolution falls back to these
 * BEFORE the generic template defaults — so a tenant whose row is missing or
 * cleared serves its real brand content instead of the generic "Your Business"
 * placeholder. (GLDF's live <title> was "Your Business |" for exactly this
 * reason: its `settings` row was never populated and resolution fell through to
 * the generic default, even though gldf-content-defaults.ts held the real
 * values — they just weren't wired into the read path.)
 *
 * This is the same source `seed-tenant.ts` writes at provision time; keeping it
 * as a read-path fallback makes the correct content the floor, not something
 * that has to be seeded to exist.
 */
const TENANT_CONTENT_DEFAULTS: Record<string, ContentMap> = {
  gldf: gldfContentDefaults,
  demo: demoContentDefaults,
};

export function getTenantContentDefault<K extends ContentSection>(
  tenant: string,
  section: K,
): ContentMap[K] | undefined {
  return TENANT_CONTENT_DEFAULTS[tenant]?.[section];
}
