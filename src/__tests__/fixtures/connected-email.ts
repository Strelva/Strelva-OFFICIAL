import type { RequiredConnectionsPort } from "@/platform/system-versions/required-connections";

/** Downstream runtime fixtures start with a policy-qualified fictional email
 * service. Real account admission/refusal is covered by Connections suites. */
export const connectedEmail: RequiredConnectionsPort = {
  connectionEligibilityFor: async (_actor, input) => input.provider === "resend"
    ? { eligible: true, through: { kind: "platform" } }
    : { eligible: false, reason: "not_configured", message: "Fictional provider is unavailable." },
  listWorkspaceConnections: async (_actor, workspaceId) => ({ connections: [{
    ref: `resend:${workspaceId}`, provider: "resend", workspaceId, accountLabel: "Fictional sending service",
    accountHolder: { kind: "platform" }, accessThrough: { kind: "platform" },
    state: "connected", unavailableReason: null, connectedAt: null, systemIds: [],
  }], sourceErrors: [] }),
};
