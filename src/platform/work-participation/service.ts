import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { WorkAuthority, WorkAuthoritySnapshot } from "../work-context/authority";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";

const email = z.string().trim().toLowerCase().email().max(254);
const revision = z.number().int().min(0);
const money = z.number().int().min(0).max(100_000_000);
const grantSchema = z.object({
  id: z.string(), participantEmail: email, participantKind: z.enum(["person", "agent"]),
  scope: z.array(z.enum(["read", "propose"])).min(1).max(2), purpose: z.string().min(1).max(1000),
  expiresAt: z.string().datetime(), budgetMinor: money, currency: z.string().regex(/^[A-Z]{3}$/),
  sponsorId: z.string(), createdAt: z.string().datetime(), status: z.enum(["active", "revoked"]), revokedAt: z.string().optional(),
});
const contributionSchema = z.object({
  id: z.string(), grantId: z.string(), actorId: z.string(), actorEmail: email, sponsorId: z.string(),
  baseWorkRevision: z.string(), summary: z.string().min(1).max(500), content: z.string().max(20000),
  costMinor: money.nullable(), currency: z.string(), idempotencyKey: z.string().min(1).max(120),
  status: z.enum(["pending", "accepted", "rejected"]), createdAt: z.string(),
  reviewedBy: z.string().optional(), reviewedAt: z.string().optional(), reviewReason: z.string().optional(),
});
const eventSchema = z.object({ id: z.string(), actorId: z.string(), kind: z.string(), at: z.string(), subjectId: z.string() });
export const participationSchema = z.object({ version: z.literal(1), revision, grants: z.array(grantSchema).max(100), contributions: z.array(contributionSchema).max(500), history: z.array(eventSchema).max(1000) });
export type WorkParticipation = z.infer<typeof participationSchema>;
export const participationCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("grant"), expectedRevision: revision, participantEmail: email, participantKind: z.enum(["person", "agent"]), scope: z.array(z.enum(["read", "propose"])).min(1).max(2), purpose: z.string().trim().min(1).max(1000), expiresAt: z.string().datetime(), budgetMinor: money, currency: z.string().regex(/^[A-Z]{3}$/) }),
  z.object({ kind: z.literal("revoke"), expectedRevision: revision, grantId: z.string() }),
  z.object({ kind: z.literal("contribute"), expectedRevision: revision, grantId: z.string(), baseWorkRevision: z.string(), summary: z.string().trim().min(1).max(500), content: z.string().max(20000), costMinor: money.nullable(), idempotencyKey: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("review"), expectedRevision: revision, contributionId: z.string(), decision: z.enum(["accept", "reject"]), reason: z.string().trim().min(1).max(1000) }),
]);

function state(raw: unknown): WorkParticipation {
  return raw == null ? { version: 1, revision: 0, grants: [], contributions: [], history: [] } : participationSchema.parse(raw);
}
function activeGrant(data: WorkParticipation, actor: WorkspaceActor, id: string | undefined, now: Date) {
  const grant = data.grants.find(g => (!id || g.id === id) && g.participantEmail === actor.verifiedEmail.toLowerCase() && g.status === "active" && Date.parse(g.expiresAt) > now.getTime());
  if (!grant) throw new WorkspaceAccessError("The work grant is unavailable or expired.");
  return grant;
}
function project(data: WorkParticipation, snapshot: WorkAuthoritySnapshot, actor: WorkspaceActor, now: Date): WorkParticipation {
  if (snapshot.role) return data;
  activeGrant(data, actor, undefined, now);
  const grants = data.grants.filter(g => g.participantEmail === actor.verifiedEmail.toLowerCase());
  const ids = new Set(grants.map(g => g.id));
  const contributions = data.contributions.filter(c => ids.has(c.grantId));
  const subjects = new Set([...ids, ...contributions.map(c => c.id)]);
  return { ...data, grants, contributions, history: data.history.filter(e => subjects.has(e.subjectId)) };
}
function requireManager(snapshot: WorkAuthoritySnapshot) {
  if (snapshot.role !== "owner" && snapshot.role !== "admin") throw new WorkspaceAccessError("A workspace owner or administrator must manage this grant.");
}

export function createParticipationService(authority: WorkAuthority, clock = () => new Date()) {
  return {
    async inspect(actor: WorkspaceActor, workId: string) {
      const snapshot = await authority.read(actor, workId, "participation");
      return { ...project(state(snapshot.payload), snapshot, actor, clock()), currentActorEmail: actor.verifiedEmail.toLowerCase(), workRevision: snapshot.work.revision, canManage: snapshot.role === "owner" || snapshot.role === "admin" };
    },
    async read(actor: WorkspaceActor, workId: string) {
      const snapshot = await authority.read(actor, workId, "participation");
      return project(state(snapshot.payload), snapshot, actor, clock());
    },
    async readTarget(actor: WorkspaceActor, workId: string) {
      const snapshot = await authority.read(actor, workId, "participation");
      if (!snapshot.role && !activeGrant(state(snapshot.payload), actor, undefined, clock()).scope.includes("read")) throw new WorkspaceAccessError("This grant does not include reading the work.");
      return snapshot.work;
    },
    async change(actor: WorkspaceActor, workId: string, raw: unknown) {
      const command = participationCommandSchema.parse(raw);
      const snapshot = await authority.read(actor, workId, "participation");
      const next = structuredClone(state(snapshot.payload));
      const now = clock();
      let subjectId: string;
      if (command.kind === "contribute") {
        const grant = activeGrant(next, actor, command.grantId, now);
        if (!grant.scope.includes("propose")) throw new WorkspaceAccessError("This grant does not include proposing changes.");
        const previous = next.contributions.find(c => c.grantId === grant.id && c.idempotencyKey === command.idempotencyKey);
        if (previous) {
          if (previous.actorId !== actor.userId || previous.summary !== command.summary || previous.content !== command.content || previous.costMinor !== command.costMinor || previous.baseWorkRevision !== command.baseWorkRevision) throw new WorkspaceConflictError("The retry key belongs to a different contribution.");
          return project(next, snapshot, actor, now);
        }
        if (snapshot.work.revision !== command.baseWorkRevision) throw new WorkspaceConflictError("The work changed. Review its latest version before contributing.");
        // Unknown costs cannot consume an explicitly bounded outside-work allowance.
        const spent = next.contributions.filter(c => c.grantId === grant.id).reduce((sum, c) => sum + (c.costMinor ?? 0), 0);
        if (command.costMinor === null || spent + command.costMinor > grant.budgetMinor) throw new WorkspaceConflictError("The contribution cost exceeds its grant or is unknown.");
        subjectId = randomUUID();
        next.contributions.push({ id: subjectId, grantId: grant.id, actorId: actor.userId, actorEmail: actor.verifiedEmail.toLowerCase(), sponsorId: grant.sponsorId, baseWorkRevision: command.baseWorkRevision, summary: command.summary, content: command.content, costMinor: command.costMinor, currency: grant.currency, idempotencyKey: command.idempotencyKey, status: "pending", createdAt: now.toISOString() });
      } else {
        requireManager(snapshot);
        if (command.kind === "grant") {
          if (Date.parse(command.expiresAt) <= now.getTime() || Date.parse(command.expiresAt) > now.getTime() + 90 * 86400000) throw new WorkspaceConflictError("Choose a grant expiry within 90 days.");
          if (next.grants.some(g => g.status === "active" && g.participantEmail === command.participantEmail && Date.parse(g.expiresAt) > now.getTime())) throw new WorkspaceConflictError("Revoke the existing grant before replacing its scope.");
          subjectId = randomUUID();
          next.grants.push({ id: subjectId, participantEmail: command.participantEmail, participantKind: command.participantKind, scope: [...new Set(command.scope)], purpose: command.purpose, expiresAt: command.expiresAt, budgetMinor: command.budgetMinor, currency: command.currency, sponsorId: actor.userId, createdAt: now.toISOString(), status: "active" });
        } else if (command.kind === "revoke") {
          const grant = next.grants.find(g => g.id === command.grantId);
          if (!grant) throw new WorkspaceAccessError();
          subjectId = grant.id;
          grant.status = "revoked";
          grant.revokedAt = now.toISOString();
        } else {
          const contribution = next.contributions.find(c => c.id === command.contributionId);
          if (!contribution || contribution.status !== "pending") throw new WorkspaceConflictError("This contribution has already been reviewed or is unavailable.");
          if (command.decision === "accept" && contribution.baseWorkRevision !== snapshot.work.revision) throw new WorkspaceConflictError("The work changed. Request a revised contribution before accepting.");
          subjectId = contribution.id;
          contribution.status = command.decision === "accept" ? "accepted" : "rejected";
          contribution.reviewedBy = actor.userId;
          contribution.reviewedAt = now.toISOString();
          contribution.reviewReason = command.reason;
        }
      }
      if (next.revision !== command.expectedRevision) throw new WorkspaceConflictError("Participation changed. Reload before continuing.");
      next.revision++;
      next.history.push({ id: randomUUID(), actorId: actor.userId, kind: command.kind, subjectId, at: now.toISOString() });
      participationSchema.parse(next);
      await authority.commit(actor, workId, "participation", command.expectedRevision, next, command.kind === "contribute" ? "contribute" : "manage", snapshot.work.revision);
      return project(next, snapshot, actor, now);
    },
  };
}
