import { InquiryEngine } from "@/products/inquiries/client";
import type { InquiryCapabilityDefinition } from "@/products/inquiries/contracts";
import type { InquiryAudience, InquirySurfaceAdapter, InquirySurfaceSnapshot } from "./contracts";

const FIXTURE_TIME = "2026-09-11T14:00:00.000Z";
const BUSINESS_ID = "buffalo-realty";

/** All transitions use the product engine. This adapter has no network transport. */
export function createPreviewInquiryAdapter(
  audience: InquiryAudience = "business",
  scenarioName?: string,
): InquirySurfaceAdapter {
  let sequence = 0;
  const publishedFixtures = new Map<string, InquiryCapabilityDefinition | null>();
  const engine = new InquiryEngine({
    businessId: BUSINESS_ID,
    now: () => new Date(Date.parse(FIXTURE_TIME) + sequence * 1000).toISOString(),
    idFactory: (prefix: string) => `fixture_${prefix}_${++sequence}`,
    livePublisher: {
      async publish(input) {
        publishedFixtures.set(input.capabilityId, structuredClone(input.definition));
        return { status: "accepted", acceptanceId: `fixture-acceptance-${++sequence}`, acceptedAt: FIXTURE_TIME, providerReceipt: { simulation: true, target: "isolated fixture memory" } };
      },
    },
  });
  if (scenarioName !== "empty" && scenarioName !== "unavailable") {
    engine.start({
      actorId: "fixture-owner",
      intent: "Create a seller inquiry form and route requests to Maria, with a follow-up if nobody replies.",
      title: "Seller inquiries",
      destination: "maria@example.invalid",
      emailConnection: { status: "connected", consent: "explicit", lastCheckedAt: FIXTURE_TIME },
    });
  }
  const context: Omit<InquirySurfaceSnapshot, "state" | "capabilities"> = {
    business: {
      id: BUSINESS_ID,
      name: "Buffalo Realty",
      domain: "buffalo-realty.example",
      role: scenarioName === "read-only" ? "read_only" : audience === "agency" ? "agency_member" : "owner",
      description: "Fictional brokerage. No real customers, messages, or website changes.",
    },
    connections: ["google", "email", "calendar", "stripe", "mls"].map((id) => ({
      id: id as "google" | "email" | "calendar" | "stripe" | "mls",
      label: { google: "Google", email: "Email", calendar: "Calendar", stripe: "Stripe", mls: "MLS" }[id]!,
      status: "not_configured",
      canSee: [],
      canDo: [],
      lastCheckedAt: null,
      consentRequired: true,
      manageHref: null,
    })),
    onboarding: {
      website: "https://buffalo-realty.example",
      statements: [
        { id: "website", label: "Website", value: "https://buffalo-realty.example", provenance: "Fictional fixture", editable: true, confirmed: false },
        { id: "business", label: "Business name", value: "Buffalo Realty", provenance: "Fictional fixture", editable: true, confirmed: false },
        { id: "type", label: "Business type", value: "Brokerage", provenance: "Fictional fixture", editable: true, confirmed: false },
      ],
      checks: [{ id: "website", label: "Website evidence", status: "unknown", detail: "No website was fetched in this isolated preview." }],
    },
    audience,
    available: scenarioName !== "unavailable",
    readOnly: scenarioName === "read-only",
    rehearsal: true,
  };
  const getSnapshot = (): InquirySurfaceSnapshot => {
    const state = engine.snapshot();
    return {
      ...structuredClone(context), state, capabilities: state.capabilities,
      whyByInquiry: Object.fromEntries(state.inquiries.map((record) => [record.id, engine.explainWhy(record.id)])),
      patterns: state.capabilities.filter((capability) => capability.live && capability.status === "live").map((capability) => ({
        id: capability.id, capabilityId: capability.id, sourceBusinessId: BUSINESS_ID,
        name: capability.live!.name, summary: "Reuse this rehearsed inquiry configuration with a fresh review.",
        provenVersion: capability.live!.version,
        cleanReceiptCount: state.changes.filter((change) => change.capabilityId === capability.id && change.verification?.verified).length,
      })),
    };
  };
  return {
    getSnapshot,
    async execute(action) {
      if (!context.available) throw new Error("Inquiry work is unavailable. Try again later.");
      if (context.readOnly) throw new Error("This business is read-only for your account.");
      switch (action.kind) {
        case "start": {
          const work = engine.start({ ...action.input, destination: "maria@example.invalid", title: action.input.title || "Inquiry form", emailConnection: { status: "connected", consent: "explicit", lastCheckedAt: FIXTURE_TIME } });
          return { snapshot: getSnapshot(), work };
        }
        case "contextual-request": {
          const work = engine.startContextualRequest({ actorId: action.actorId, inquiryId: action.inquiryId, intent: action.intent });
          return { snapshot: getSnapshot(), work, message: `Started a new request from inquiry ${action.inquiryId}. Review its shape before continuing.` };
        }
        case "accept-shape": {
          const work = engine.acceptShape(action.requestId, action.input);
          if (!engine.snapshot().responsibilities.some((policy) => policy.capabilityId === work.capabilityId)) {
            engine.createResponsibility({
              actorId: action.input.actorId, capabilityId: work.capabilityId, title: "Handle inquiry follow-up",
              scope: "Route inquiries to Maria and prepare a follow-up when no one has replied.",
              allowedActions: ["send_message", "schedule_follow_up", "charge", "delete", "change_permissions"],
              never: [{ action: "charge", sentence: "Never charge a customer." }, { action: "delete", sentence: "Never delete an inquiry." }, { action: "change_permissions", sentence: "Never change anyone's access." }],
              approval: [{ action: "send_message", sentence: "Ask before sending a customer message." }],
              escalation: { primary: "Maria", secondary: null },
              budget: { dailyMessages: 10, timezone: "America/New_York" },
              hours: { timezone: "America/New_York", days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
            });
          }
          return { snapshot: getSnapshot(), work };
        }
        case "edit": {
          const result = engine.applyDraftEdit(action.requestId, action.input);
          return { snapshot: getSnapshot(), work: result.work, change: result.receipt };
        }
        case "edit-rules": {
          const result = engine.updateInquiryRules(action.requestId, action.input);
          return { snapshot: getSnapshot(), work: result.work, change: result.receipt };
        }
        case "set-email-consent": {
          const work = engine.getWork(action.requestId);
          if (!action.granted) {
            for (const policy of engine.snapshot().responsibilities.filter((item) => item.capabilityId === work.capabilityId && item.status === "active")) engine.pauseResponsibility(policy.id, action.actorId);
          }
          const result = engine.setEmailConnection(action.requestId, { actorId: action.actorId, status: action.granted ? "connected" : "missing", consent: action.granted ? "explicit" : "missing", lastCheckedAt: FIXTURE_TIME });
          const email = context.connections.find((item) => item.id === "email")!;
          email.status = action.granted ? "connected" : "not_configured";
          email.canDo = action.granted ? ["Simulate inquiry messages in the isolated test inbox"] : [];
          email.lastCheckedAt = FIXTURE_TIME;
          return { snapshot: getSnapshot(), work: result.work, change: result.receipt, message: action.granted ? "Permission recorded for this isolated rehearsal only." : "Rehearsal email permission revoked and the standing job paused." };
        }
        case "rehearse": {
          const rehearsal = engine.runRehearsal(action.requestId);
          return { snapshot: getSnapshot(), work: engine.getWork(action.requestId), rehearsal };
        }
        case "publish": {
          const draft = engine.getWork(action.requestId).draft;
          if (!draft) throw new Error("Accept the shape before making it live.");
          engine.approvePublish(action.requestId, { actorId: action.actorId, version: draft.version });
          const result = await engine.publish(action.requestId, { actorId: action.actorId, version: draft.version, explicit: true });
          if (result.provider.status === "accepted") {
            const observed = publishedFixtures.get(draft.id);
            engine.recordPublishVerification(action.requestId, { actorId: action.actorId, version: draft.version, verified: JSON.stringify(observed) === JSON.stringify(draft), evidence: ["Read back exact definition from isolated fixture memory; no live website was changed."] });
          }
          return { snapshot: getSnapshot(), work: engine.getWork(action.requestId), change: engine.listChanges(draft.id).find((change) => change.id === result.receipt.id), message: "Rehearsal publication checked. No live website was changed." };
        }
        case "undo": {
          const result = await engine.undo(action.requestId, { actorId: action.actorId, explicit: true });
          return { snapshot: getSnapshot(), work: result.work, change: result.receipt, message: "The rehearsal configuration was restored. Inquiry records remain." };
        }
        case "pause":
        case "resume": {
          const work = engine.getWork(action.requestId);
          const policy = engine.snapshot().responsibilities.find((item) => item.capabilityId === work.capabilityId);
          if (!policy) throw new Error("This capability has no standing responsibility.");
          if (action.kind === "pause") engine.pauseResponsibility(policy.id, action.actorId);
          else engine.resumeResponsibility(policy.id, action.actorId);
          return { snapshot: getSnapshot(), work: engine.getWork(action.requestId) };
        }
        case "promote-responsibility": {
          engine.promoteResponsibility(action.responsibilityId, action.actorId);
          return { snapshot: getSnapshot() };
        }
        case "update-responsibility": {
          engine.updateResponsibility(action.responsibilityId, action.input);
          return { snapshot: getSnapshot(), message: "The responsibility was updated and returned to supervised trust. Its receipt is recorded." };
        }
        case "bulk-record": {
          const change = engine.bulkUpdateInquiries({ inquiryIds: action.recordIds, actorId: action.actorId, status: action.action === "assign" ? "assigned" : "handled", why: "The owner selected these inquiries for one bulk change." });
          return { snapshot: getSnapshot(), change, affectedRecordIds: action.recordIds };
        }
        case "bulk-undo": {
          const selected = new Set(action.recordIds);
          const source = engine.snapshot().changes.find((change) => change.undoAvailable && change.items.length > 0 && change.items.every((item) => item.kind === "record" && selected.has(item.path.split(".")[1]!)));
          if (!source) throw new Error("There is no matching bulk change available to undo.");
          const change = engine.undoBulkChange(source.id, { actorId: action.actorId });
          return { snapshot: getSnapshot(), change, affectedRecordIds: action.recordIds };
        }
        case "simulate-inquiry": {
          const capability = engine.snapshot().capabilities.find((item) => item.id === action.capabilityId);
          if (!capability?.live) throw new Error("Rehearse and publish this fixture before submitting a pretend inquiry.");
          const record = engine.receiveInquiry({ capabilityId: capability.id, expectedCapabilityVersion: capability.live.version, fields: action.fields });
          return { snapshot: getSnapshot(), record, message: "Pretend inquiry recorded in this isolated preview." };
        }
        case "correct-onboarding": {
          const statement = context.onboarding.statements.find((item) => item.id === action.statementId);
          if (!statement?.editable) throw new Error("This statement cannot be edited.");
          const value = action.value.trim();
          if (!value || value.length > 1000) throw new Error("Enter a correction between 1 and 1,000 characters.");
          if (statement.id === "website") {
            let website: URL;
            try { website = new URL(value); } catch { throw new Error("Enter a complete website address."); }
            if (!["http:", "https:"].includes(website.protocol)) throw new Error("Use an HTTP or HTTPS website address.");
            context.onboarding.website = website.href;
          }
          statement.value = value;
          statement.confirmed = true;
          statement.provenance = "Corrected by you in this isolated preview";
          return { snapshot: getSnapshot(), message: "Correction saved for this preview session." };
        }
        case "scan-onboarding":
          return { snapshot: getSnapshot(), message: "Reading a website is blocked in this isolated preview. Enter the facts yourself or use an authorized workspace." };
        case "fix-why": {
          const why = engine.explainWhy(action.requestId);
          if (!why.fix || why.fix.targetPath !== action.path) throw new Error("That proposed fix is no longer available. Review the current timeline.");
          const work = engine.start({ actorId: action.actorId, intent: `${why.fix.title}. ${why.fix.reason}`, title: why.fix.title, destination: "maria@example.invalid" });
          return { snapshot: getSnapshot(), work, why, message: "Review the proposed shape before making a change." };
        }
        case "use-pattern": {
          if (action.businessId !== BUSINESS_ID) throw new Error("This preview only grants access to Buffalo Realty.");
          const work = engine.copyPattern(action.patternId, { sourceCapabilityId: action.patternId, targetBusinessId: BUSINESS_ID, targetActorId: action.actorId, destination: action.destination ?? "your team", emailConnection: { status: "missing", consent: "missing", lastCheckedAt: null } });
          return { snapshot: getSnapshot(), work, message: "Pattern copied as a draft. Review its staff destination, email permission, and rehearsal before making it live." };
        }
      }
    },
  };
}
