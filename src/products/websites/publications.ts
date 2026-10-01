import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { WORKSPACE_EXIT_STOPPED_MESSAGE, WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { HostedWebsitePages } from "./hosting";

/** Postgres owns what is publicly live; see supabase/migrations/20260928120000_website_publications.sql. */

export class WebsiteAddressTakenError extends WorkspaceConflictError {
  constructor() {
    super("That website address is already in use.");
    this.name = "WebsiteAddressTakenError";
  }
}

export interface WebsitePublicationRow {
  address: string;
  status: "live" | "offline";
  candidateRevision: number;
  contentHash: string;
  publishedAt: string;
  updatedAt: string;
}

export interface LiveWebsite {
  address: string;
  contentHash: string;
  connectOrigin: string | null;
  pages: HostedWebsitePages;
}

type Rpc = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> };

function rpcClient(): Rpc {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Website publishing storage is unavailable.");
  return db as unknown as Rpc;
}

function rowFrom(value: Record<string, unknown> | undefined): WebsitePublicationRow {
  if (!value) throw new WorkspaceStoreError("The website publication could not be confirmed.");
  return {
    address: String(value.address),
    status: value.status === "live" ? "live" : "offline",
    candidateRevision: Number(value.candidate_revision),
    contentHash: String(value.content_hash),
    publishedAt: new Date(String(value.published_at)).toISOString(),
    updatedAt: new Date(String(value.updated_at)).toISOString(),
  };
}

function throwFor(error: { message: string }): never {
  if (error.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (error.message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (error.message.includes("website_address_taken")) throw new WebsiteAddressTakenError();
  if (error.message.includes("website_publication_not_approved")) throw new WorkspaceConflictError("Only the current approved website preview can be published.");
  if (error.message.includes("website_publication_missing")) throw new WorkspaceConflictError("This website is not published.");
  throw new WorkspaceStoreError("The website publication could not be confirmed.");
}

export interface PublishWebsiteRecordInput {
  workspaceId: string;
  workId: string;
  address: string;
  candidateRevision: number;
  contentHash: string;
  artifactDigest: string;
  connectOrigin: string | null;
  pages: HostedWebsitePages;
}

export interface WebsitePublicationStore {
  publish(actor: WorkspaceActor, input: PublishWebsiteRecordInput): Promise<WebsitePublicationRow>;
  takeOffline(actor: WorkspaceActor, input: { workspaceId: string; workId: string }): Promise<WebsitePublicationRow>;
  readLive(address: string): Promise<LiveWebsite | null>;
}

export const websitePublicationStore: WebsitePublicationStore = {
  async publish(actor, input) {
    const { data, error } = await rpcClient().rpc("publish_website", {
      p_work_id: z.string().uuid().parse(input.workId),
      p_workspace_id: z.string().uuid().parse(input.workspaceId),
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
      p_address: input.address,
      p_candidate_revision: input.candidateRevision,
      p_content_hash: input.contentHash,
      p_artifact_digest: input.artifactDigest,
      p_connect_origin: input.connectOrigin,
      p_pages: input.pages,
    });
    if (error) throwFor(error);
    return rowFrom(data?.[0]);
  },
  async takeOffline(actor, input) {
    const { data, error } = await rpcClient().rpc("take_website_offline", {
      p_work_id: z.string().uuid().parse(input.workId),
      p_workspace_id: z.string().uuid().parse(input.workspaceId),
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
    });
    if (error) throwFor(error);
    return rowFrom(data?.[0]);
  },
  async readLive(address) {
    const { data, error } = await rpcClient().rpc("read_live_website", { p_address: address });
    if (error) throw new WorkspaceStoreError("The website could not be loaded.");
    const row = data?.[0];
    if (!row || !row.pages || typeof row.pages !== "object" || Array.isArray(row.pages)) return null;
    return {
      address: String(row.address),
      contentHash: String(row.content_hash),
      connectOrigin: typeof row.connect_origin === "string" ? row.connect_origin : null,
      pages: row.pages as HostedWebsitePages,
    };
  },
};
