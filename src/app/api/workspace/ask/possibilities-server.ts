import { createPossibilityAdapter, AskPossibilityUnsupportedError } from "@/platform/ask/ports";
import { createSupabasePossibilityRepository } from "@/platform/possibilities/supabase-repository";
import { prepareAskPageSet, websiteRebuildReleasedFor } from "@/products/websites/index";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { PossibilityRepository } from "@/platform/possibilities";
import { prepareExistingAskBookingPage } from "./booking-possibility-server";
import { prepareExistingAskWebsitePages } from "./existing-website-possibility-server";
import { prepareAskInquiryFollowUp } from "./inquiry-follow-up-possibility-server";
import { possibilityPreviewPath } from "@/platform/possibilities/preview-link";

export function createAskPossibilityPort(actor: WorkspaceActor, dependencies: {
  repository?: PossibilityRepository; prepare?: typeof prepareAskPageSet; released?: typeof websiteRebuildReleasedFor;
  sync?: (actor: WorkspaceActor, workspaceId: string) => Promise<{ complete: boolean }>;
  booking?: typeof prepareExistingAskBookingPage;
  existingWebsite?: typeof prepareExistingAskWebsitePages;
  inquiryFollowUp?: typeof prepareAskInquiryFollowUp;
} = {}) {
  const port = createPossibilityAdapter(dependencies.repository ?? createSupabasePossibilityRepository(actor), {
    durable: true,
    async prepare(currentActor, input, id) {
      if (input.candidate?.kind === "inquiry-follow-up-rule") return (dependencies.inquiryFollowUp ?? prepareAskInquiryFollowUp)(currentActor, input, id);
      if (!input.candidate) throw new AskPossibilityUnsupportedError("This alternative has no supported page-set candidate.");
      if (!await (dependencies.released ?? websiteRebuildReleasedFor)(currentActor, input.workspaceId)) throw new AskPossibilityUnsupportedError("Working page-set preparation is not enabled for this business.");
      if (input.candidate.kind === "existing-website-pages") return (dependencies.existingWebsite ?? prepareExistingAskWebsitePages)(currentActor, input);
      if (input.candidate.kind === "existing-booking-page") return (dependencies.booking ?? prepareExistingAskBookingPage)(currentActor, input);
      if (!input.introduces) throw new AskPossibilityUnsupportedError("A new informational website needs its own System name and purpose.");
      // These require executable Connections, not informational text or disabled buttons.
      if (/\b(book(?:ing)?|appointments?|intake|forms?|payments?|checkout|reservations?|applications?)\b/i.test(`${input.words ?? ""} ${input.intent} ${input.introduces.purpose}`)) {
        throw new AskPossibilityUnsupportedError("This flow needs an approved executable Connection and a safe publication binding. An informational page set cannot stand in for it.");
      }
      const record = await (dependencies.prepare ?? prepareAskPageSet)(currentActor, { workspaceId: input.workspaceId, name: input.introduces.name, requestId: `ask-${id}`, candidate: input.candidate });
      const candidate = record.rebuild.candidate!;
      return {
        content: { kind: "ask-website-pages", rebuildWorkId: record.workId, contextSystemId: input.systemId, candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash, document: candidate.document, originalWords: input.words?.slice(0, 3000) ?? input.intent, askOrigin: input.origin ?? null, askedOnBehalf: input.askedOnBehalf ?? null },
        previewHref: candidate.previewHref,
        effects: [{ id: "publish-pages", kind: "publish", channel: "hosted_website", system: { introducedKey: input.introduces.key }, description: `Publish ${input.introduces.name}`, request: { workId: record.workId, candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash }, after: [] }],
      };
    },
  });
  return {
    ...port,
    async open(currentActor: WorkspaceActor, input: Parameters<typeof port.open>[1]) {
      const opened = await port.open(currentActor, input);
      let tryHref: string | undefined;
      try {
        if (opened.candidateRevision) tryHref = possibilityPreviewPath({ workspaceId: input.workspaceId, possibilityId: opened.id, candidateRevision: opened.candidateRevision });
      } catch { /* Native review remains available when signing is not configured. */ }
      let reviewStatus: "needs_you" | "pending_sync" = "pending_sync";
      if (dependencies.sync) {
        try { if ((await dependencies.sync(currentActor, input.workspaceId)).complete === true) reviewStatus = "needs_you"; }
        catch { /* The saved draft stays held; Home retries synchronization. */ }
      }
      return { ...opened, ...(tryHref ? { tryHref } : {}), reviewStatus };
    },
  };
}
