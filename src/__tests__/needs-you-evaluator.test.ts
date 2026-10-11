import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHANGE_KINDS,
  KIND_RULES,
  LADDER_ROUTES,
  isConfigurableKind,
  nextChaseStep,
  routeRank,
  type ChangeKind,
  type ConfigurableKind,
  type LadderRoute,
  type PolicySetting,
} from "@/platform/needs-you/contracts";
import { evaluateRoute, validatePolicyChange } from "@/platform/needs-you/evaluator";

const configurable = CHANGE_KINDS.filter(isConfigurableKind) as ConfigurableKind[];
const SYSTEM = "11111111-1111-4111-8111-111111111111";

describe("change kinds and the SQL mirror", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261007120000_needs_you.sql"), "utf8");
  function sqlCase(fn: string): Record<string, string> {
    const body = sql.slice(sql.indexOf(`create function public.${fn}(`));
    const block = body.slice(0, body.indexOf("else null end"));
    return Object.fromEntries([...block.matchAll(/when '([a-z_.]+)' then '([a-z_]+)'/g)].map(m => [m[1], m[2]]));
  }

  it("floors and defaults match the migration exactly", () => {
    const floors = sqlCase("needs_you_kind_floor");
    const defaults = sqlCase("needs_you_kind_default");
    expect(Object.keys(floors).sort()).toEqual([...configurable].sort());
    for (const kind of configurable) {
      expect(floors[kind], `floor of ${kind}`).toBe(KIND_RULES[kind].floor);
      expect(defaults[kind], `default of ${kind}`).toBe(KIND_RULES[kind].default);
    }
  });

  it("the kind list and sign-in kinds match the migration", () => {
    const listed = sql.match(/needs_you_change_kinds\(\) returns text\[\][\s\S]*?array\[([\s\S]*?)\]::text\[\]/)?.[1] ?? "";
    expect([...listed.matchAll(/'([a-z_.]+)'/g)].map(m => m[1])).toEqual([...CHANGE_KINDS]);
    expect(sql).toContain("select p_kind in ('access.grant','money','exit')");
    expect(configurable.filter(kind => KIND_RULES[kind].signInRequired).sort()).toEqual(["access.grant", "exit", "money"]);
  });

  it("no default sits below its floor", () => {
    for (const kind of configurable) expect(routeRank(KIND_RULES[kind].default)).toBeGreaterThanOrEqual(routeRank(KIND_RULES[kind].floor));
  });
});

describe("evaluateRoute: fixed rules", () => {
  it("suggestions and owner actions never reach Needs you", () => {
    expect(evaluateRoute({ kind: "suggestion", origin: "strelva" })).toMatchObject({ route: "never", rule: "fixed:suggestion" });
    expect(evaluateRoute({ kind: "health.owner_action", origin: "strelva" })).toMatchObject({ route: "never", rule: "fixed:owner_action" });
  });

  it("an inferred fact always goes to the owner, whatever is set", () => {
    const loose: PolicySetting[] = [{ layer: "strelva", systemId: null, kind: "fact.inferred", route: "owner_decides" }];
    for (const origin of ["owner_exact", "owner_interpreted", "strelva", "operator", "agency"] as const) {
      expect(evaluateRoute({ kind: "fact.inferred", origin, policies: loose })).toMatchObject({ route: "owner_decides", rule: "fixed:fact_inferred" });
    }
  });

  it("access, money and exit go to the owner and need a sign-in, even when the owner asked exactly", () => {
    for (const kind of ["access.grant", "money", "exit"] as const) {
      expect(evaluateRoute({ kind, origin: "owner_exact" })).toMatchObject({ route: "owner_decides", signInRequired: true, rule: "fixed:owner_only_kind" });
    }
  });

  it("a 1-2 star review reply goes to the owner even in auto mode", () => {
    expect(evaluateRoute({ kind: "review.reply", origin: "strelva", signals: { reviewRating: 1 } })).toMatchObject({ kind: "review.reply_critical", route: "owner_decides", urgent: true });
    expect(evaluateRoute({ kind: "review.reply", origin: "strelva", signals: { reviewRating: 5 } })).toMatchObject({ route: "handle_after_notice", noticeWindowMs: 12 * 3600 * 1000 });
  });
});

describe("evaluateRoute: every kind x every route x every floor", () => {
  for (const kind of configurable) {
    for (const route of LADDER_ROUTES) {
      it(`${kind} set to ${route} by Strelva lands at or above its floor`, () => {
        const result = evaluateRoute({ kind, origin: "strelva", policies: [{ layer: "strelva", systemId: null, kind, route }] });
        if (result.route === "never") throw new Error("unexpected never");
        expect(routeRank(result.route)).toBeGreaterThanOrEqual(routeRank(KIND_RULES[kind].floor));
        if (kind !== "fact.inferred" && kind !== "access.grant" && kind !== "money" && kind !== "exit") {
          expect(result.route).toBe(routeRank(route) >= routeRank(KIND_RULES[kind].floor) ? route : KIND_RULES[kind].floor);
        }
      });
    }
  }
});

describe("evaluateRoute: owner and Strelva layers", () => {
  it("uses Strelva's default when nothing is set", () => {
    expect(evaluateRoute({ kind: "copy.marketing", origin: "strelva" })).toMatchObject({ route: "strelva_reviews", rule: "default" });
    expect(evaluateRoute({ kind: "structure", origin: "strelva" })).toMatchObject({ route: "owner_decides" });
  });

  it("an owner's stricter setting wins, per System or for all", () => {
    const allSystems: PolicySetting[] = [
      { layer: "strelva", systemId: null, kind: "copy.routine", route: "handle" },
      { layer: "owner", systemId: null, kind: "copy.routine", route: "strelva_reviews" },
    ];
    expect(evaluateRoute({ kind: "copy.routine", origin: "strelva", policies: allSystems })).toMatchObject({ route: "strelva_reviews", rule: "owner_setting" });
    const oneSystem: PolicySetting[] = [{ layer: "owner", systemId: SYSTEM, kind: "google.post", route: "owner_decides" }];
    expect(evaluateRoute({ kind: "google.post", origin: "strelva", systemId: SYSTEM, policies: oneSystem }).route).toBe("owner_decides");
    expect(evaluateRoute({ kind: "google.post", origin: "strelva", systemId: null, policies: oneSystem }).route).toBe("strelva_reviews");
  });

  it("a Strelva System setting overrides its business setting", () => {
    const rows: PolicySetting[] = [
      { layer: "strelva", systemId: null, kind: "google.post", route: "strelva_reviews" },
      { layer: "strelva", systemId: SYSTEM, kind: "google.post", route: "handle_after_notice" },
    ];
    expect(evaluateRoute({ kind: "google.post", origin: "strelva", systemId: SYSTEM, policies: rows }).route).toBe("handle_after_notice");
  });

  it("earned trust promotes routine copy only, never past an owner setting", () => {
    const trust = { streak: 5, threshold: 3 };
    expect(evaluateRoute({ kind: "copy.routine", origin: "strelva", signals: { earnedTrust: trust } })).toMatchObject({ route: "handle", rule: "earned_trust" });
    expect(evaluateRoute({ kind: "copy.marketing", origin: "strelva", signals: { earnedTrust: trust } }).route).toBe("strelva_reviews");
    expect(evaluateRoute({ kind: "copy.routine", origin: "strelva", signals: { earnedTrust: { streak: 2, threshold: 3 } } }).route).toBe("strelva_reviews");
    expect(evaluateRoute({ kind: "copy.routine", origin: "strelva", signals: { earnedTrust: trust }, policies: [{ layer: "owner", systemId: null, kind: "copy.routine", route: "owner_decides" }] }).route).toBe("owner_decides");
  });

  it("supervised inquiry messages get Strelva review and current trusted ordinary messages are handled", () => {
    expect(evaluateRoute({ kind: "customer.message", origin: "strelva", signals: { inquiryDecision: "approval_required" } })).toMatchObject({ route: "strelva_reviews", urgent: false });
    expect(evaluateRoute({ kind: "customer.message", origin: "strelva", signals: { inquiryDecision: "allow" } })).toMatchObject({ route: "handle", rule: "inquiry:policy" });
    expect(evaluateRoute({ kind: "customer.message", origin: "strelva", signals: { inquiryDecision: "block" } }).route).toBe("never");
    expect(evaluateRoute({ kind: "customer.message", origin: "strelva", signals: { inquiryDecision: "allow" }, policies: [{ kind: "customer.message", layer: "owner", systemId: null, route: "owner_decides" }] }).route).toBe("owner_decides");
    expect(evaluateRoute({ kind: "customer.commitment", origin: "strelva", signals: { inquiryDecision: "allow" } }).route).toBe("owner_decides");
    expect(evaluateRoute({ kind: "customer.message", origin: "strelva", policies: [{ kind: "customer.message", layer: "strelva", systemId: null, route: "handle" }] }).route).toBe("strelva_reviews");
  });
});

describe("evaluateRoute: origin", () => {
  it("an exact owner request is handled and reported", () => {
    expect(evaluateRoute({ kind: "fact.owner_stated", origin: "owner_exact" })).toMatchObject({ route: "handle", rule: "origin:owner_exact" });
    expect(evaluateRoute({ kind: "copy.routine", origin: "owner_exact" })).toMatchObject({ route: "handle" });
  });

  it("an exact owner request still respects the floor and the owner's own standing setting", () => {
    expect(evaluateRoute({ kind: "copy.marketing", origin: "owner_exact" })).toMatchObject({ route: "strelva_reviews", rule: "floor" });
    expect(evaluateRoute({ kind: "review.reply", origin: "owner_exact" }).route).toBe("handle_after_notice");
    expect(evaluateRoute({ kind: "copy.routine", origin: "owner_exact", policies: [{ layer: "owner", systemId: null, kind: "copy.routine", route: "owner_decides" }] }).route).toBe("owner_decides");
  });

  it("an exact request never short-circuits commitments, broadcasts or go-live", () => {
    for (const kind of ["customer.commitment", "customer.broadcast", "system.go_live", "request.scope", "running.approve"] as const) {
      expect(evaluateRoute({ kind, origin: "owner_exact" }).route).toBe("owner_decides");
    }
  });

  it("a request Strelva had to interpret never inherits the owner's authority", () => {
    expect(evaluateRoute({ kind: "copy.routine", origin: "owner_interpreted", policies: [{ layer: "strelva", systemId: null, kind: "copy.routine", route: "handle" }] }))
      .toMatchObject({ route: "owner_decides", rule: "origin:owner_asked" });
    expect(evaluateRoute({ kind: "fact.owner_stated", origin: "owner_interpreted" }).route).toBe("owner_decides");
  });

  it("a Strelva-started change never takes the owner shortcut", () => {
    expect(evaluateRoute({ kind: "copy.routine", origin: "strelva" }).route).toBe("strelva_reviews");
    expect(evaluateRoute({ kind: "fact.owner_stated", origin: "strelva" }).route).toBe("handle");
  });
});

describe("validatePolicyChange", () => {
  it("refuses every below-floor setting for both layers", () => {
    for (const kind of configurable) {
      for (const route of LADDER_ROUTES) {
        const below = routeRank(route) < routeRank(KIND_RULES[kind].floor);
        const strelva = validatePolicyChange({ layer: "strelva", kind, route });
        expect(strelva.ok, `${kind} -> ${route}`).toBe(!below);
        if (below) expect(strelva).toEqual({ ok: false, reason: "below_floor" });
      }
    }
  });

  it("lets an owner tighten, and loosen only back to Strelva's default", () => {
    const strelva: PolicySetting[] = [{ layer: "strelva", systemId: null, kind: "copy.routine", route: "handle_after_notice" }];
    expect(validatePolicyChange({ layer: "owner", kind: "copy.routine", route: "owner_decides", policies: strelva }).ok).toBe(true);
    expect(validatePolicyChange({ layer: "owner", kind: "copy.routine", route: "handle_after_notice", policies: strelva }).ok).toBe(true);
    expect(validatePolicyChange({ layer: "owner", kind: "copy.routine", route: "handle", policies: strelva })).toEqual({ ok: false, reason: "looser_than_default" });
    expect(validatePolicyChange({ layer: "owner", kind: "copy.routine", route: null, policies: strelva }).ok).toBe(true);
    expect(validatePolicyChange({ layer: "owner", kind: "google.post", route: "handle_after_notice" })).toEqual({ ok: false, reason: "looser_than_default" });
  });

  it("refuses kinds that are never decisions", () => {
    for (const kind of ["suggestion", "health.owner_action"] as ChangeKind[]) {
      expect(validatePolicyChange({ layer: "strelva", kind, route: "owner_decides" })).toEqual({ ok: false, reason: "not_configurable" });
    }
  });
});

describe("chase clock", () => {
  const day = 24 * 3600 * 1000;
  const opened = Date.parse("2026-10-01T11:00:00Z");
  const item = (over: Partial<{ reminded1At: string | null; reminded2At: string | null; state: "open" | "approved"; route: "owner_decides" | "strelva_reviews" }> = {}) => ({
    state: "open" as const, route: "owner_decides" as const, openedAt: new Date(opened).toISOString(), expiresAt: new Date(opened + 14 * day).toISOString(),
    reminded1At: null, reminded2At: null, ...over,
  });
  it("reminds on day 3 and day 7 and lapses on day 14, once each", () => {
    expect(nextChaseStep(item(), opened + 2 * day)).toBe("none");
    expect(nextChaseStep(item(), opened + 3 * day)).toBe("reminder_1");
    expect(nextChaseStep(item({ reminded1At: "x" }), opened + 4 * day)).toBe("none");
    expect(nextChaseStep(item({ reminded1At: "x" }), opened + 7 * day)).toBe("reminder_2");
    expect(nextChaseStep(item(), opened + 8 * day)).toBe("reminder_2");
    expect(nextChaseStep(item({ reminded1At: "x", reminded2At: "y" }), opened + 10 * day)).toBe("none");
    expect(nextChaseStep(item({ reminded1At: "x", reminded2At: "y" }), opened + 14 * day)).toBe("lapse");
  });
  it("never chases closed or operator items", () => {
    expect(nextChaseStep(item({ state: "approved" }), opened + 20 * day)).toBe("none");
    expect(nextChaseStep(item({ route: "strelva_reviews" }), opened + 20 * day)).toBe("none");
  });
});

// Keep LadderRoute referenced for the type import above.
const _route: LadderRoute = "handle";
void _route;
