import { describe, expect, it } from "vitest";
import {
  deriveIntelligenceStatus,
  getIntegrationDefinition,
  normalizeIntegrationStatus,
  type IntegrationStatus,
  type IntelligenceStatus,
  type IntegrationStatusInput,
} from "../lib/integration-registry";

// Ontology Phase 5 (#11): lock the connection-status model that already separates
// the AUTHORIZATION axis (`needs_reauth` — reconnect the account) from the SYNC-HEALTH
// axis (`sync_failed` — a transient/API failure). These are distinct enum values, not a
// separate authStatus×syncHealth matrix, because every surface renders exactly one status.

const def = (id: string) => {
  const d = getIntegrationDefinition(id);
  if (!d) throw new Error(`missing integration definition: ${id}`);
  return d;
};

// The full set of raw `Connection.status` strings + defensive aliases the normalizer
// accepts. The persisted producers are: OAuth callbacks / yelp connect write "connected";
// both token pollers write "needs_reauth" on a failed refresh; the API read-fallback is
// "disconnected". The remaining strings are defensive aliases the normalizer already maps.
const REAUTH_FAMILY = [
  "needs_reauth",
  "reauth_required",
  "requires_reauth",
  "token_expired",
  "expired",
  "unauthorized",
];
const SYNC_FAILED_FAMILY = ["error", "sync_failed", "failed"];

describe("normalizeIntegrationStatus — authorization vs sync-health axes", () => {
  // THE headline distinction the phase is about: a reauth-family raw status is an
  // authorization problem (the owner must reconnect), a sync/error-family status is a
  // health problem (may self-heal). They must land in different buckets.
  it.each(REAUTH_FAMILY)("maps reauth-family raw status %s -> needs_reauth", (raw) => {
    expect(
      normalizeIntegrationStatus(def("yelp"), {
        connection: { provider: "yelp", connected: false, status: raw },
        connectionLoaded: true,
      })
    ).toBe("needs_reauth");
  });

  it.each(SYNC_FAILED_FAMILY)("maps sync/error-family raw status %s -> sync_failed", (raw) => {
    expect(
      normalizeIntegrationStatus(def("yelp"), {
        connection: { provider: "yelp", connected: false, status: raw },
        connectionLoaded: true,
      })
    ).toBe("sync_failed");
  });

  it("is case-insensitive on the raw status", () => {
    expect(
      normalizeIntegrationStatus(def("yelp"), {
        connection: { provider: "yelp", connected: false, status: "NEEDS_REAUTH" },
        connectionLoaded: true,
      })
    ).toBe("needs_reauth");
  });

  it("keeps the two axes separate on the same definition (not collapsed into one error state)", () => {
    const reauth = normalizeIntegrationStatus(def("instagram"), {
      connection: { provider: "instagram", connected: false, status: "needs_reauth" },
      connectionLoaded: true,
    });
    const failed = normalizeIntegrationStatus(def("instagram"), {
      connection: { provider: "instagram", connected: false, status: "error" },
      connectionLoaded: true,
    });
    expect(reauth).toBe("needs_reauth");
    expect(failed).toBe("sync_failed");
    expect(reauth).not.toBe(failed);
  });
});

describe("normalizeIntegrationStatus — the real poller -> normalizer chain", () => {
  // poll-google-reviews / poll-instagram write status:"needs_reauth" on a dead refresh
  // token. The provider connection is read by the google-business / instagram definitions.
  // Locks that a revoked token surfaces as "reconnect", NOT "sync failed".
  it("surfaces a Google token-refresh failure as needs_reauth (not sync_failed)", () => {
    expect(
      normalizeIntegrationStatus(def("google-business"), {
        connection: { provider: "google", connected: false, status: "needs_reauth" },
        connectionLoaded: true,
      })
    ).toBe("needs_reauth");
  });

  it("surfaces an Instagram token-refresh failure as needs_reauth (not sync_failed)", () => {
    expect(
      normalizeIntegrationStatus(def("instagram"), {
        connection: { provider: "instagram", connected: false, status: "needs_reauth" },
        connectionLoaded: true,
      })
    ).toBe("needs_reauth");
  });
});

describe("normalizeIntegrationStatus — connected precedence + built-ins", () => {
  it("treats the connected flag or a connected status as connected", () => {
    expect(
      normalizeIntegrationStatus(def("yelp"), {
        connection: { provider: "yelp", connected: true },
        connectionLoaded: true,
      })
    ).toBe("connected");
    expect(
      normalizeIntegrationStatus(def("yelp"), {
        connection: { provider: "yelp", status: "connected" },
        connectionLoaded: true,
      })
    ).toBe("connected");
  });

  it("lets the connected flag win over a stale error status", () => {
    expect(
      normalizeIntegrationStatus(def("yelp"), {
        connection: { provider: "yelp", connected: true, status: "error" },
        connectionLoaded: true,
      })
    ).toBe("connected");
  });

  it("reports built-in sources as connected with no connection at all", () => {
    expect(normalizeIntegrationStatus(def("reviews"))).toBe("connected");
    expect(normalizeIntegrationStatus(def("website-activity"))).toBe("connected");
  });
});

describe("normalizeIntegrationStatus — settings/config + unloaded states", () => {
  type Row = {
    name: string;
    id: string;
    input?: IntegrationStatusInput;
    expected: IntegrationStatus;
  };

  const rows: Row[] = [
    // Connectable provider (yelp): no connection = not configured; unloaded = unknown.
    { name: "yelp / no input", id: "yelp", expected: "not_configured" },
    {
      name: "yelp / connection loaded, connected:false",
      id: "yelp",
      input: { connection: { provider: "yelp", connected: false }, connectionLoaded: true },
      expected: "not_configured",
    },
    {
      name: "yelp / connection unloaded (no settingsKey) -> unknown",
      id: "yelp",
      input: { connectionLoaded: false },
      expected: "unknown",
    },
    {
      name: "yelp / disconnected read-fallback status -> not_configured",
      id: "yelp",
      input: { connection: { provider: "yelp", connected: false, status: "disconnected" }, connectionLoaded: true },
      expected: "not_configured",
    },
    // Settings-key source (GSC): driven by tenant settings, unknown while unloaded.
    { name: "gsc / no input", id: "google-search-console", expected: "not_configured" },
    {
      name: "gsc / setting on",
      id: "google-search-console",
      input: { settings: { googleSearchConsole: true }, settingsLoaded: true },
      expected: "connected",
    },
    {
      name: "gsc / setting off",
      id: "google-search-console",
      input: { settings: { googleSearchConsole: false }, settingsLoaded: true },
      expected: "not_configured",
    },
    {
      name: "gsc / settings unloaded (no connectionProvider) -> unknown",
      id: "google-search-console",
      input: { settingsLoaded: false },
      expected: "unknown",
    },
    // Dual source (instagram: connectionProvider AND settingsKey) — neither unknown
    // branch fires when everything is unloaded, so it reads not_configured, not unknown.
    {
      name: "instagram / everything unloaded -> not_configured (has both provider + settingsKey)",
      id: "instagram",
      input: { connectionLoaded: false, settingsLoaded: false },
      expected: "not_configured",
    },
    // Garbage/unrecognized raw status falls through to not_configured, never a false connected.
    {
      name: "yelp / unrecognized raw status -> not_configured",
      id: "yelp",
      input: { connection: { provider: "yelp", connected: false, status: "banana" }, connectionLoaded: true },
      expected: "not_configured",
    },
  ];

  it.each(rows)("$name", ({ id, input, expected }) => {
    expect(normalizeIntegrationStatus(def(id), input)).toBe(expected);
  });
});

describe("deriveIntelligenceStatus", () => {
  type Row = {
    name: string;
    id: string;
    status: IntegrationStatus;
    expected: IntelligenceStatus;
  };

  const rows: Row[] = [
    // Both broken axes route to needs_attention (the one place the axes reconverge —
    // the intelligence surface just says "this needs you", the badge says which kind).
    { name: "needs_reauth -> needs_attention", id: "yelp", status: "needs_reauth", expected: "needs_attention" },
    { name: "sync_failed -> needs_attention", id: "yelp", status: "sync_failed", expected: "needs_attention" },
    // Built-ins are always live regardless of connection status.
    { name: "built-in + can-act -> can_act_here", id: "reviews", status: "not_configured", expected: "can_act_here" },
    { name: "built-in + uses-signal -> ai_using_it", id: "website-activity", status: "not_configured", expected: "ai_using_it" },
    { name: "built-in + can-act (no signal flag) -> can_act_here", id: "social", status: "connected", expected: "can_act_here" },
    // Non-built-in, not connected -> no signal.
    { name: "connectable not connected -> no_signal", id: "yelp", status: "not_configured", expected: "no_signal" },
    { name: "connectable unknown -> no_signal", id: "google-business", status: "unknown", expected: "no_signal" },
    // Non-built-in, connected -> capability by flags.
    { name: "connected + can-act -> can_act_here", id: "newsletter", status: "connected", expected: "can_act_here" },
    { name: "connected, no can-act/signal flags -> signal_available", id: "yelp", status: "connected", expected: "signal_available" },
    { name: "connected + uses-signal -> ai_using_it", id: "google-search-console", status: "connected", expected: "ai_using_it" },
    { name: "connected, no flags -> signal_available", id: "google-business", status: "connected", expected: "signal_available" },
  ];

  it.each(rows)("$name", ({ id, status, expected }) => {
    expect(deriveIntelligenceStatus(def(id), status)).toBe(expected);
  });
});
