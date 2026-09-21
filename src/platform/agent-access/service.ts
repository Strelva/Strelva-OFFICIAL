import { createHash, randomBytes, randomUUID } from "node:crypto";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { WorkAuthority } from "@/platform/work-context/authority";
import { prepareContextPayload, prepareContextText } from "@/platform/work-context/preparation";
import { createParticipationService } from "@/platform/work-participation/service";
import { agentAccessCommandSchema, agentProposalSchema, type AgentAccessRecord, type AgentAccessStore, type NativeParticipationCommit, type ParticipationAccess } from "./types";

export function hashAgentAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function prepareNativeChange(authority: WorkAuthority, actor: WorkspaceActor, workId: string, command: unknown, clock: () => Date): Promise<{ native: NativeParticipationCommit; result: Awaited<ReturnType<ReturnType<typeof createParticipationService>["change"]>> }> {
  let native: NativeParticipationCommit | null = null;
  const capture: WorkAuthority = {
    read: (...args) => authority.read(...args),
    source: (...args) => authority.source(...args),
    grantedSource: (...args) => authority.grantedSource(...args),
    async commit(_actor, _workId, domain, expectedRevision, payload, intent, expectedWorkRevision) {
      if (domain !== "participation" || (intent !== "manage" && intent !== "contribute")) throw new WorkspaceStoreError("Agent access prepared an invalid native change.");
      native = { expectedRevision, payload, expectedWorkRevision };
    },
  };
  const result = await createParticipationService(capture, clock).change(actor, workId, command);
  if (!native) throw new WorkspaceStoreError("Agent access could not prepare its native authority change.");
  return { native, result };
}

function activeLinkedGrant(record: AgentAccessRecord, participation: Awaited<ReturnType<ParticipationAccess["inspect"]>>, now: Date, scope: "read" | "propose") {
  if (record.revokedAt || Date.parse(record.expiresAt) <= now.getTime() || !record.scopes.includes(scope)) throw new WorkspaceAccessError("This integration token is unavailable or lacks the requested scope.");
  const grant = participation.grants.find(value => value.id === record.grantId);
  if (!grant || grant.participantKind !== "agent" || grant.participantEmail !== record.issuer.verifiedEmail.toLowerCase() || grant.status !== "active" || Date.parse(grant.expiresAt) <= now.getTime() || !grant.scope.includes(scope)) {
    throw new WorkspaceAccessError("This integration token is unavailable or lacks the requested scope.");
  }
  if (Date.parse(record.expiresAt) > Date.parse(grant.expiresAt) || record.scopes.some(value => !grant.scope.includes(value))) throw new WorkspaceAccessError("This integration token no longer matches its native grant.");
  return grant;
}

export function createAgentAccessService(input: { authority: WorkAuthority; participation: ParticipationAccess; store: AgentAccessStore; clock?: () => Date }) {
  const clock = input.clock ?? (() => new Date());
  async function requireCurrentIssuer(record: AgentAccessRecord) {
    const snapshot = await input.authority.read(record.issuer, record.workId, "participation");
    if (!snapshot.role) throw new WorkspaceAccessError("The integration issuer no longer has current workspace access.");
  }
  return {
    async manage(actor: WorkspaceActor, raw: unknown) {
      const command = agentAccessCommandSchema.parse(raw);
      if (command.kind === "issue") {
        const now = clock();
        if (Date.parse(command.expiresAt) <= now.getTime() || Date.parse(command.expiresAt) > now.getTime() + 90 * 86400000) throw new WorkspaceConflictError("Choose an integration expiry within 90 days.");
        const tokenId = randomUUID();
        const token = `sta_${randomBytes(32).toString("base64url")}`;
        const agentLabel = prepareContextText({ value: command.agentLabel, maxCharacters: 120 }).value || "Personal AI integration";
        const purpose = prepareContextText({ value: command.purpose, maxCharacters: 1_000 }).value || "Review and propose work";
        const { native } = await prepareNativeChange(input.authority, actor, command.workId, {
          kind: "grant", expectedRevision: command.expectedRevision, participantEmail: actor.verifiedEmail,
          participantKind: "agent", scope: [...new Set(command.scopes)], purpose,
          expiresAt: command.expiresAt, budgetMinor: command.budgetMinor, currency: command.currency,
        }, clock);
        const payload = native.payload as { grants?: Array<{ id: string; participantEmail: string }> };
        const created = payload.grants?.slice().reverse().find(grant => grant.participantEmail === actor.verifiedEmail.toLowerCase());
        if (!created) throw new WorkspaceStoreError("The native integration grant was not prepared.");
        const record: AgentAccessRecord = {
          id: tokenId, workId: command.workId, grantId: created.id, tokenHash: hashAgentAccessToken(token), tokenPrefix: token.slice(0, 12),
          issuer: { userId: actor.userId, verifiedEmail: actor.verifiedEmail.toLowerCase() }, agentLabel,
          scopes: [...new Set(command.scopes)], expiresAt: command.expiresAt, createdAt: now.toISOString(), revokedAt: null,
        };
        await input.store.issue({ actor, record, native });
        const { tokenHash: _tokenHash, issuer: _issuer, ...integration } = record;
        return { token, integration: { ...integration, authority: "issuing_user" as const } };
      }
      const record = await input.store.managed(actor, command.workId, command.tokenId);
      if (!record) throw new WorkspaceAccessError("The integration token is unavailable.");
      const { native } = await prepareNativeChange(input.authority, actor, command.workId, { kind: "revoke", expectedRevision: command.expectedRevision, grantId: record.grantId }, clock);
      const revokedAt = clock().toISOString();
      await input.store.revoke({ actor, record, native, revokedAt });
      return { integration: { id: record.id, workId: record.workId, grantId: record.grantId, agentLabel: record.agentLabel, authority: "issuing_user" as const, revokedAt } };
    },
    async list(actor: WorkspaceActor, workId: string) {
      const participation = await input.participation.inspect(actor, workId);
      if (!participation.canManage) throw new WorkspaceAccessError("A workspace owner or administrator must manage integrations.");
      const records = await input.store.list(actor, workId);
      return records.map(({ tokenHash: _tokenHash, issuer: _issuer, ...record }) => ({ ...record, authority: "issuing_user" as const }));
    },
    async read(token: string, workId: string) {
      const record = await input.store.resolve(hashAgentAccessToken(token), workId);
      if (!record) throw new WorkspaceAccessError("The integration token is unavailable.");
      await requireCurrentIssuer(record);
      const participation = await input.participation.inspect(record.issuer, workId);
      activeLinkedGrant(record, participation, clock(), "read");
      const target = await input.participation.readTarget(record.issuer, workId);
      await input.store.recordEvent({ tokenId: record.id, issuerUserId: record.issuer.userId, workId, grantId: record.grantId, action: "read", at: clock().toISOString() });
      return { id: target.id, title: prepareContextText({ value: target.title, maxCharacters: 160 }).value, revision: target.revision, payload: prepareContextPayload(target.payload), integration: { tokenId: record.id, agentLabel: record.agentLabel, authority: "issuing_user" as const, scopes: record.scopes } };
    },
    async propose(token: string, workId: string, raw: unknown) {
      const proposal = agentProposalSchema.parse(raw);
      const record = await input.store.resolve(hashAgentAccessToken(token), workId);
      if (!record) throw new WorkspaceAccessError("The integration token is unavailable.");
      await requireCurrentIssuer(record);
      const participation = await input.participation.inspect(record.issuer, workId);
      activeLinkedGrant(record, participation, clock(), "propose");
      const idempotencyKey = `${record.id}:${proposal.idempotencyKey}`;
      const content = JSON.stringify({
        version: 1,
        kind: "agent_access_proposal",
        tokenId: record.id,
        agentLabel: record.agentLabel,
        proposal: prepareContextText({ value: proposal.proposal, maxCharacters: 8_000 }).value,
        evidence: proposal.evidence.map(item => ({ label: prepareContextText({ value: item.label, maxCharacters: 160 }).value, value: prepareContextText({ value: item.value, maxCharacters: 1_000 }).value })),
      });
      const summary = prepareContextText({ value: proposal.summary, maxCharacters: 500 }).value || "External proposal";
      const changed = await input.participation.change(record.issuer, workId, { kind: "contribute", expectedRevision: participation.revision, grantId: record.grantId, baseWorkRevision: proposal.baseWorkRevision, summary, content, costMinor: proposal.costMinor, idempotencyKey });
      const contribution = changed.contributions.find(value => value.grantId === record.grantId && value.idempotencyKey === idempotencyKey);
      if (!contribution) throw new WorkspaceStoreError("The integration proposal could not be confirmed.");
      await input.store.recordEvent({ tokenId: record.id, issuerUserId: record.issuer.userId, workId, grantId: record.grantId, action: "propose", contributionId: contribution.id, idempotencyKey, at: clock().toISOString() });
      return { contributionId: contribution.id, status: contribution.status, workId, tokenId: record.id };
    },
  };
}
