import { customerEmailEnabled, emailSendingEnabled } from "@/lib/email-enabled";
import { getClientEmailOverride } from "@/lib/client-email-override";
import type { InquiryEngine } from "./inquiry-engine";
import type { InquiryConnectionView } from "./connections";

export async function inquiryEmailReadiness(tenantId: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY?.trim() || !customerEmailEnabled()) return false;
  const override = await getClientEmailOverride(tenantId);
  return override === "on" || (override !== "off" && emailSendingEnabled());
}

/** Permission to use shared transactional mail is separate from provider keys. */
export async function applyInquiryEmailConsent(engine: InquiryEngine, input: {
  tenantId: string;
  requestId: string;
  actorId: string;
  granted: boolean;
}) {
  const ready = input.granted && await inquiryEmailReadiness(input.tenantId);
  const work = engine.getWork(input.requestId);
  // Revoking mail also stops the currently operated job immediately. A new
  // draft connection alone would leave its previously published rule running.
  if (!input.granted) {
    for (const policy of engine.snapshot().responsibilities.filter((item) => item.capabilityId === work.capabilityId && item.status === "active")) {
      engine.pauseResponsibility(policy.id, input.actorId);
    }
  }
  const result = engine.setEmailConnection(input.requestId, {
    actorId: input.actorId,
    status: ready ? "connected" : "missing",
    consent: input.granted ? "explicit" : "missing",
    lastCheckedAt: new Date().toISOString(),
  });
  return {
    ...result,
    message: !input.granted
      ? "Email permission revoked and the standing job paused."
      : ready ? "Email permission recorded. Customer messages still need your approval or a rule you explicitly set."
        : "Email permission recorded. Delivery is unavailable until Strelva's sending service is enabled.",
  };
}

export async function projectInquiryEmailConnection(engine: InquiryEngine, tenantId: string): Promise<InquiryConnectionView> {
  const grants = engine.snapshot().requests.flatMap((work) => work.draft?.connections ?? []);
  const granted = grants.filter((connection) => connection.provider === "email" && connection.consent === "explicit");
  const ready = granted.length > 0 && await inquiryEmailReadiness(tenantId);
  const lastCheckedAt = grants.map((item) => item.lastCheckedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return {
    id: "email", label: "Email", status: ready ? "connected" : granted.length ? "unavailable" : "not_configured",
    canSee: [],
    canDo: granted.length ? ["Send inquiry notifications and customer follow-ups after approval or under an explicit rule"] : [],
    lastCheckedAt, consentRequired: true, manageHref: null,
  };
}
