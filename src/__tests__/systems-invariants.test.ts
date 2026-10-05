import { describe, expect, it } from "vitest";
import {
  acceptOutput,
  applyCurrentRevisionSwap,
  applyLifecycleTransition,
  applySystemRevision,
  applySystemUpdate,
  assertConnectionAllowed,
  canTransitionLifecycle,
  connectionStateAfterTargetChange,
  connectionTargetKey,
  connectInputSchema,
  outputRevisionFor,
  systemOriginId,
  wouldCreateCycle,
  type System,
  type SystemConnection,
  type SystemRef,
  type SystemRevision,
} from "@/platform/systems";

const BUSINESS = "5e000000-0000-4000-8000-000000000010";
const OTHER = "5e000000-0000-4000-8000-000000000011";
const AT = "2026-10-04T12:00:00.000Z";
const ref = (n: number, businessId = BUSINESS): SystemRef => ({ businessId, systemId: `5e000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}` });

function system(overrides: Partial<System> = {}): System {
  return {
    id: ref(1).systemId, businessId: BUSINESS, name: "Catering proposal", purpose: null, kind: "proposal",
    lifecycle: "draft", currentRevision: null, origin: null, changeNumber: 1, createdAt: AT, updatedAt: AT, ...overrides,
  };
}

function revision(number: number, base = system()): SystemRevision {
  return {
    id: `5e000000-0000-4000-8000-0000000002${String(number).padStart(2, "0")}`, businessId: base.businessId, systemId: base.id, number,
    implementation: { kind: "proposal_document", ref: `doc:${number}` }, summary: null, createdAt: AT, createdBy: BUSINESS,
  };
}

function edge(kind: SystemConnection["kind"], from: SystemRef, to: SystemRef, state: SystemConnection["state"] = "connected") {
  return { kind, source: from, target: { type: "system" as const, system: to }, state };
}

describe("System identity", () => {
  it("keeps id and owner across revisions", () => {
    let current = system();
    for (const number of [1, 2, 3]) current = applySystemRevision(current, revision(number), AT);
    expect(current.id).toBe(ref(1).systemId);
    expect(current.businessId).toBe(BUSINESS);
    expect(current.currentRevision?.number).toBe(3);
    expect(current.changeNumber).toBe(4);
  });

  it("refuses a revision of another System", () => {
    const foreign = { ...revision(1), systemId: ref(2).systemId };
    expect(() => applySystemRevision(system(), foreign, AT)).toThrow(expect.objectContaining({ code: "system_identity_immutable" }));
  });

  it("moves the pointer only by compare-and-set", () => {
    const v1 = applySystemRevision(system(), revision(1), AT);
    const staged = revision(2);
    expect(() => applyCurrentRevisionSwap(v1, staged, null, AT)).toThrow(expect.objectContaining({ code: "system_baseline_moved" }));
    const v2 = applyCurrentRevisionSwap(v1, staged, revision(1).id, AT);
    expect(v2.currentRevision?.number).toBe(2);
    expect(applyCurrentRevisionSwap(v2, staged, "anything", AT)).toBe(v2);
    const restored = applyCurrentRevisionSwap(v2, revision(1), staged.id, AT);
    expect(restored).toMatchObject({ id: v1.id, currentRevision: { number: 1 } });
  });

  it("changes kind without changing identity", () => {
    const next = applySystemUpdate(system(), { kind: "portal", name: "Catering portal" }, AT);
    expect(next).toMatchObject({ id: ref(1).systemId, businessId: BUSINESS, kind: "portal", name: "Catering portal" });
  });

  it("derives the same adoption id as the database", () => {
    // Pinned in tests/systems-schema.sql against public.system_origin_id.
    expect(systemOriginId(BUSINESS, { kind: "saved_work", ref: "5e000000-0000-4000-8000-0000000000a1" }))
      .toBe("f155e662-163a-42f3-a0ea-e12c754a9a96");
    // A managed website's System keeps this tenant-derived id through conversion.
    expect(systemOriginId(BUSINESS, { kind: "tenant", ref: "5e000000-0000-4000-8000-0000000000b2" }))
      .toBe("60111262-7fba-474e-a004-3f5d2eee18f0");
    expect(systemOriginId(OTHER, { kind: "saved_work", ref: "5e000000-0000-4000-8000-0000000000a1" }))
      .not.toBe("f155e662-163a-42f3-a0ea-e12c754a9a96");
  });
});

describe("lifecycle", () => {
  it("allows only draft->live, live->paused, paused->live", () => {
    const states = ["draft", "live", "paused"] as const;
    const legal = states.flatMap((from) => states.filter((to) => canTransitionLifecycle(from, to)).map((to) => `${from}->${to}`));
    expect(legal).toEqual(["draft->live", "live->paused", "paused->live"]);
  });

  it("needs a revision to go live", () => {
    expect(() => applyLifecycleTransition(system(), "live", AT)).toThrow(expect.objectContaining({ code: "system_revision_required" }));
    const withRevision = applySystemRevision(system(), revision(1), AT);
    expect(applyLifecycleTransition(withRevision, "live", AT).lifecycle).toBe("live");
  });

  it("never returns a live System to draft", () => {
    const live = applyLifecycleTransition(applySystemRevision(system(), revision(1), AT), "live", AT);
    expect(() => applyLifecycleTransition(live, "draft", AT)).toThrow(expect.objectContaining({ code: "system_lifecycle_invalid" }));
  });
});

describe("issued outputs", () => {
  it("pin the revision that produced them while the System moves on", () => {
    const v1 = applySystemRevision(system(), revision(1), AT);
    const pinned = outputRevisionFor(v1);
    const v2 = applySystemRevision(v1, revision(2), AT);
    expect(pinned.number).toBe(1);
    expect(v2.currentRevision?.number).toBe(2);
    const output = {
      id: ref(9).systemId, businessId: BUSINESS, systemId: v1.id, revision: pinned, kind: "proposal", title: "Smith wedding",
      status: "issued" as const, snapshotHash: "a".repeat(64), issuedAt: AT, acceptedAt: null,
    };
    const accepted = acceptOutput(output, AT);
    expect(accepted.revision).toEqual(pinned);
    expect(() => acceptOutput(accepted, AT)).toThrow(expect.objectContaining({ code: "system_output_transition_invalid" }));
  });

  it("cannot be issued from a System with no revision", () => {
    expect(() => outputRevisionFor(system())).toThrow(expect.objectContaining({ code: "system_output_requires_revision" }));
  });
});

describe("connections", () => {
  it("refuses self connections", () => {
    expect(() => assertConnectionAllowed({ source: ref(1), kind: "read", target: { type: "system", system: ref(1) } }, []))
      .toThrow(expect.objectContaining({ code: "system_connection_self" }));
  });

  it("crosses businesses only as an explicit share", () => {
    for (const kind of ["read", "act", "appear", "depend", "trigger"] as const) {
      expect(() => assertConnectionAllowed({ source: ref(1), kind, target: { type: "system", system: ref(2, OTHER) } }, []))
        .toThrow(expect.objectContaining({ code: "system_connection_cross_business" }));
    }
    expect(() => assertConnectionAllowed({ source: ref(1), kind: "share", target: { type: "system", system: ref(2, OTHER) } }, [])).not.toThrow();
  });

  it("keeps depend and trigger acyclic but allows read loops", () => {
    const existing = [edge("depend", ref(1), ref(2)), edge("depend", ref(2), ref(3)), edge("read", ref(3), ref(1))];
    expect(wouldCreateCycle(existing, "depend", ref(3), ref(1))).toBe(true);
    expect(() => assertConnectionAllowed({ source: ref(3), kind: "depend", target: { type: "system", system: ref(1) } }, existing))
      .toThrow(expect.objectContaining({ code: "system_connection_cycle" }));
    expect(() => assertConnectionAllowed({ source: ref(1), kind: "read", target: { type: "system", system: ref(3) } }, existing)).not.toThrow();
    // A disconnected edge does not count toward a loop.
    const broken = [edge("depend", ref(1), ref(2), "disconnected"), edge("depend", ref(2), ref(3))];
    expect(wouldCreateCycle(broken, "depend", ref(3), ref(1))).toBe(false);
  });

  it("marks only manual_review connections stale when the target changes", () => {
    expect(connectionStateAfterTargetChange({ state: "connected", propagation: "manual_review" })).toBe("stale");
    expect(connectionStateAfterTargetChange({ state: "connected", propagation: "pin_on_issue" })).toBe("connected");
    expect(connectionStateAfterTargetChange({ state: "disconnected", propagation: "manual_review" })).toBe("disconnected");
  });

  it("keys targets the way the database does", () => {
    expect(connectionTargetKey({ type: "system", system: ref(2) })).toBe(`system:${BUSINESS}:${ref(2).systemId}`);
    expect(connectionTargetKey({ type: "account_binding", bindingId: "cal-1" })).toBe("account_binding:cal-1");
  });

  it("validates every target type", () => {
    const targets = [
      { type: "business_resource", resource: "business_record:services" },
      { type: "audience", audience: "returning_customers" },
      { type: "account_binding", bindingId: "cal-1" },
      { type: "domain", domain: "juniper.example.test" },
      { type: "api", api: "stripe.checkout" },
    ];
    for (const target of targets) expect(connectInputSchema.safeParse({ source: ref(1), kind: "read", target }).success).toBe(true);
    expect(connectInputSchema.safeParse({ source: ref(1), kind: "read", target: { type: "domain", domain: "Not A Domain" } }).success).toBe(false);
    expect(connectInputSchema.safeParse({ source: ref(1), kind: "borrow", target: targets[0] }).success).toBe(false);
  });
});
