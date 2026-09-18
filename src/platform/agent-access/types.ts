import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";

export const agentAccessScopeSchema = z.enum(["read", "propose"]);
export type AgentAccessScope = z.infer<typeof agentAccessScopeSchema>;

const revision = z.number().int().nonnegative();
export const agentAccessCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("issue"), workId: z.string().uuid(), expectedRevision: revision,
    agentLabel: z.string().trim().min(1).max(120), purpose: z.string().trim().min(1).max(1000),
    scopes: z.array(agentAccessScopeSchema).min(1).max(2), expiresAt: z.string().datetime({ offset: true }),
    budgetMinor: z.number().int().min(0).max(100_000_000), currency: z.string().regex(/^[A-Z]{3}$/),
  }).strict(),
  z.object({ kind: z.literal("revoke"), workId: z.string().uuid(), expectedRevision: revision, tokenId: z.string().uuid() }).strict(),
]);
export type AgentAccessCommand = z.infer<typeof agentAccessCommandSchema>;

export const agentProposalSchema = z.object({
  baseWorkRevision: z.string().min(1).max(120),
  summary: z.string().trim().min(1).max(500),
  proposal: z.string().trim().min(1).max(8_000),
  evidence: z.array(z.object({ label: z.string().trim().min(1).max(160), value: z.string().trim().min(1).max(1_000) }).strict()).max(8),
  costMinor: z.number().int().min(0).max(100_000_000),
  idempotencyKey: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/),
}).strict();
export type AgentProposal = z.infer<typeof agentProposalSchema>;

export interface AgentAccessRecord {
  id: string; workId: string; grantId: string; tokenHash: string; tokenPrefix: string;
  issuer: WorkspaceActor; agentLabel: string; scopes: AgentAccessScope[]; expiresAt: string;
  createdAt: string; revokedAt: string | null;
}

export interface NativeParticipationCommit {
  expectedRevision: number;
  payload: unknown;
  expectedWorkRevision: string;
}

export interface AgentAccessStore {
  issue(input: { actor: WorkspaceActor; record: AgentAccessRecord; native: NativeParticipationCommit }): Promise<void>;
  revoke(input: { actor: WorkspaceActor; record: AgentAccessRecord; native: NativeParticipationCommit; revokedAt: string }): Promise<void>;
  managed(actor: WorkspaceActor, workId: string, tokenId: string): Promise<AgentAccessRecord | null>;
  list(actor: WorkspaceActor, workId: string): Promise<AgentAccessRecord[]>;
  resolve(tokenHash: string, workId: string): Promise<AgentAccessRecord | null>;
  recordEvent(input: { tokenId: string; issuerUserId: string; workId: string; grantId: string; action: "read" | "propose"; contributionId?: string; idempotencyKey?: string; at: string }): Promise<void>;
}

export interface ParticipationAccess {
  inspect(actor: WorkspaceActor, workId: string): Promise<{ revision: number; workRevision: string; canManage: boolean; grants: Array<{ id: string; participantEmail: string; participantKind: "person" | "agent"; scope: AgentAccessScope[]; expiresAt: string; status: "active" | "revoked" }> }>;
  readTarget(actor: WorkspaceActor, workId: string): Promise<{ id: string; workspaceId: string; title: string; revision: string; payload: unknown }>;
  change(actor: WorkspaceActor, workId: string, command: unknown): Promise<{ contributions: Array<{ id: string; grantId: string; idempotencyKey: string; status: string }> }>;
}
