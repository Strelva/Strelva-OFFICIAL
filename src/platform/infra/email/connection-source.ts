import { z } from "zod";
import type { ConnectionSource, WorkspaceConnection } from "@/platform/connections/contracts";
import { providerEligibility } from "@/platform/connections/eligibility";
import { providerKeyStatus } from "@/platform/connections/provider-keys";
import { resolveEmailBusinessContext, type EmailBusinessContext } from "./business-context";
import { getClientEmailOverride, type ClientEmailOverride } from "./client-override";
import { customerEmailEnabled, emailSendingEnabled } from "./enabled";
import { getSupabase } from "@/platform/infra/db/client";

export interface EmailConnectionSourceDependencies {
  customerEnabled?: () => boolean;
  clientEnabled?: () => boolean;
  context?: (scope: { workspaceId: string }) => Promise<EmailBusinessContext | null>;
  override?: (scope: string, options: { failClosed: boolean }) => Promise<ClientEmailOverride>;
  isBusinessWorkspace?: (workspaceId: string) => Promise<boolean>;
}

async function isBusinessWorkspace(workspaceId: string): Promise<boolean> {
  const db = getSupabase();
  if (!db) throw new Error("Business email settings could not be confirmed.");
  const result = await db.from("workspaces").select("id, kind").eq("id", workspaceId).maybeSingle();
  const parsed = z.object({ id: z.literal(workspaceId), kind: z.enum(["agency", "customer", "personal"]) }).safeParse(result.data);
  if (result.error || !parsed.success) throw new Error("Business email settings could not be confirmed.");
  return parsed.data.kind === "customer";
}

/**
 * A synthetic platform service row, not a legacy connected credential. It says
 * whether customer email policy is on for this business, never that a message
 * will be sent or delivered. Bookings, agency mandates and individual senders
 * retain their own additional gates. No transport or provider is imported.
 */
export function createEmailConnectionSource(deps: EmailConnectionSourceDependencies = {}): ConnectionSource {
  return {
    provider: "resend",
    async list({ workspaceId, access }) {
      z.string().uuid().parse(workspaceId);
      if (!await (deps.isBusinessWorkspace ?? isBusinessWorkspace)(workspaceId)) return [];
      const row: WorkspaceConnection = {
        ref: `resend:${workspaceId}`, provider: "resend", workspaceId,
        accountLabel: "Business customer email is off", accountHolder: { kind: "platform" }, accessThrough: { kind: "platform" },
        state: "disconnected", unavailableReason: null, connectedAt: null, systemIds: [],
      };
      const eligibility = await providerEligibility({ access, businessWorkspaceId: workspaceId,
        actingAgencyWorkspaceId: null, agencyHoldsArea: async () => false, keys: providerKeyStatus("resend") });
      if (!eligibility.eligible) return [{ ...row, state: "unavailable", unavailableReason: eligibility.reason }];
      if (!(deps.clientEnabled ?? emailSendingEnabled)() || !(deps.customerEnabled ?? customerEmailEnabled)()) return [row];
      const context = await (deps.context ?? resolveEmailBusinessContext)({ workspaceId });
      if (!context || context.workspaceId !== workspaceId || !context.businessName || !context.replyTo) {
        throw new Error("Business email settings could not be confirmed.");
      }
      const scopes = new Set([`workspace:${workspaceId}`, ...context.tenantIds]);
      for (const scope of scopes) {
        // An armed tenant never overrides another scope's exclusion or either
        // global customer gate, matching the shared transport's policy.
        if (await (deps.override ?? getClientEmailOverride)(scope, { failClosed: true }) === "off") return [row];
      }
      return [{ ...row, accountLabel: "Business customer email is on", state: "connected" }];
    },
  };
}

export const emailConnectionSource = createEmailConnectionSource();
