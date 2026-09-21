import type {
  CapabilityInvocationContext,
  ExecutableCapabilityAdapter,
} from "@/platform/capabilities";
import { createAgencyManagedWebsiteDraftAccessService } from "@/platform/offerings/agency-website-draft";
import { assertWorkspaceMember } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { websiteDraftCapabilityInputSchema } from "@/server/capabilities";
import { logActivity, logAuditEvent } from "@/lib/storage";

function parseAgencyWebsiteDraft(context: CapabilityInvocationContext, input: unknown) {
  const command = websiteDraftCapabilityInputSchema.parse(input);
  if (command.bindingId !== context.workId) {
    throw new WorkspaceConflictError("The website draft step does not name this managed website.");
  }
  return command;
}

function requireAgencyWebsiteDraft(context: CapabilityInvocationContext, input: unknown) {
  if (!context.delegated || !context.responsibilityId) {
    throw new WorkspaceAccessError("Website drafts require an accepted agency assignment.");
  }
  return parseAgencyWebsiteDraft(context, input);
}

/**
 * The website capability stays beside its native authority service. The
 * operations runner only supplies the accepted assignment context and keeps
 * receipts bounded to durable revision metadata.
 */
export const agencyWebsiteDraftAdapter: ExecutableCapabilityAdapter = {
  key: "websites.draft",
  async inspect(context, input) {
    // A customer must be able to save the exact managed website scope before
    // offering it to a named agency. The assignment and draft grant remain
    // mandatory for every delegated read, prepare, and execute path below.
    const command = parseAgencyWebsiteDraft(context, input);
    if (!context.delegated) {
      await assertWorkspaceMember(context.actor, context.workspaceId);
      return;
    }
    requireAgencyWebsiteDraft(context, command);
  },
  async recheck(context, input) {
    const command = requireAgencyWebsiteDraft(context, input);
    await createAgencyManagedWebsiteDraftAccessService().pending(
      context.actor,
      context.responsibilityId!,
      command.bindingId,
      command.section,
    );
  },
  async perform(context, input) {
    const command = requireAgencyWebsiteDraft(context, input);
    const receipt = await createAgencyManagedWebsiteDraftAccessService().execute(
      context.actor,
      context.responsibilityId!,
      command.bindingId,
      command.section,
    );
    try {
      await logAuditEvent({
        tenant: receipt.tenantId,
        actor: { userId: context.actor.userId, email: context.actor.verifiedEmail, type: "user", isSuperAdmin: false },
        action: "content.agency_draft_saved",
        targetType: "managed_website_draft",
        targetId: receipt.bindingId,
        metadata: {
          source: "agency_assignment",
          assignmentId: receipt.assignmentId,
          preparationId: receipt.preparationId,
          revisionId: receipt.revisionId,
          revision: receipt.revision,
          section: receipt.section,
          dataHash: receipt.dataHash,
          publication: "customer_only",
        },
      });
    } catch (error) {
      // The native revision receipt is durable. A secondary audit sink
      // failure must not turn a committed draft into a retryable command.
      console.error("[agency website draft] audit receipt write failed after native commit", error);
    }
    try {
      await logActivity({
        text: `Agency prepared a ${receipt.section} website draft for customer review`,
        time: new Date().toISOString(),
        type: "agency-draft",
        section: receipt.section,
        actor: "user",
        eventStatus: "pending",
      }, receipt.tenantId);
    } catch {
      // The native draft and audit receipt already committed. Activity is a
      // secondary history surface and must not invite a duplicate retry.
    }
    return receipt;
  },
};
