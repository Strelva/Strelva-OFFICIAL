import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { AskedOnBehalf } from "./contracts";

/**
 * Ask Strelva conversation history (ask-strelva spec section 5, "New"), over
 * the service-role functions in 20261008110000_ask_conversations.sql. Each
 * call re-checks the verified actor and their membership in the business.
 * Owners and admins read every conversation in the business; a member reads
 * their own; only the person who started a conversation adds to it.
 */

export interface AskHistoryMessage {
  id: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  /** Strelva's turn result: the result kind and receipt items, as streamed. */
  result: Record<string, unknown> | null;
  askedOnBehalf: AskedOnBehalf | null;
  createdAt: string;
}

export interface AskConversationSummary {
  id: string;
  systemId: string | null;
  title: string;
  messageCount: number;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AskConversation {
  id: string;
  systemId: string | null;
  title: string;
  mine: boolean;
  updatedAt: string;
  messages: AskHistoryMessage[];
}

export interface AskAppendInput {
  workspaceId: string;
  /** Null starts a conversation. */
  conversationId: string | null;
  systemId: string | null;
  role: "user" | "assistant";
  content: string;
  result?: Record<string, unknown> | null;
  askedOnBehalf?: AskedOnBehalf | null;
}

export interface AskAppended {
  conversationId: string;
  messageId: string;
  seq: number;
}

/** The port the Ask turn and route use. */
export interface AskHistoryPort {
  append(actor: WorkspaceActor, input: AskAppendInput): Promise<AskAppended>;
  list(actor: WorkspaceActor, input: { workspaceId: string; systemId: string | null; limit?: number }): Promise<AskConversationSummary[]>;
  read(actor: WorkspaceActor, input: { workspaceId: string; conversationId: string; limit?: number }): Promise<AskConversation>;
}

export class AskConversationNotFoundError extends WorkspaceAccessError {
  constructor() {
    super("This conversation is unavailable to your account.");
    this.name = "AskConversationNotFoundError";
  }
}

const iso = z.string().min(1);
const messageSchema = z.object({
  id: z.string().uuid(), seq: z.number().int().positive(), role: z.enum(["user", "assistant"]), content: z.string(),
  result: z.record(z.string(), z.unknown()).nullable(), askedOnBehalf: z.enum(["email", "phone"]).nullable(), createdAt: iso,
});
const summarySchema = z.object({
  id: z.string().uuid(), systemId: z.string().uuid().nullable(), title: z.string(), messageCount: z.number().int().nonnegative(),
  mine: z.boolean(), createdAt: iso, updatedAt: iso,
});
const conversationSchema = z.object({
  id: z.string().uuid(), systemId: z.string().uuid().nullable(), title: z.string(), mine: z.boolean(), updatedAt: iso,
  messages: z.array(messageSchema),
});
const appendedSchema = z.object({ conversationId: z.string().uuid(), messageId: z.string().uuid(), seq: z.number().int().positive() });

type DbError = { message?: string; code?: string } | null;
export type AskHistoryDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }> };

function failure(error: DbError): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("ask_conversation_not_found")) throw new AskConversationNotFoundError();
  if (detail.includes("ask_history_access_denied")) throw new WorkspaceAccessError("This business is unavailable to your account.");
  if (detail.includes("ask_conversation_system_mismatch")) throw new WorkspaceConflictError("This conversation belongs to another place. Start a new one here.");
  if (detail.includes("ask_conversation_full")) throw new WorkspaceConflictError("This conversation is full. Start a new one.");
  if (detail.includes("ask_history_invalid")) throw new WorkspaceConflictError("That message couldn't be saved.");
  throw new WorkspaceStoreError("Conversation history is unavailable.");
}

/** Supabase adapter. `db` is injectable for tests. */
export function createSupabaseAskHistory(db?: AskHistoryDb): AskHistoryPort {
  const client = (): AskHistoryDb => {
    if (db) return db;
    const value = getSupabase();
    if (!value) throw new WorkspaceStoreError("Conversation history is unavailable.");
    return value as unknown as AskHistoryDb;
  };
  const identity = (actor: WorkspaceActor) => ({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() });
  async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const { data, error } = await client().rpc(name, args);
    if (error) failure(error);
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new WorkspaceStoreError("Conversation history could not be read.");
    return parsed.data;
  }
  return {
    append: (actor, input) => call("append_ask_message", {
      p_workspace_id: input.workspaceId, ...identity(actor), p_conversation_id: input.conversationId, p_system_id: input.systemId,
      p_role: input.role, p_content: input.content, p_result: input.result ?? null, p_asked_on_behalf: input.askedOnBehalf ?? null,
    }, appendedSchema),
    list: (actor, input) => call("list_ask_conversations", {
      p_workspace_id: input.workspaceId, ...identity(actor), p_system_id: input.systemId, p_limit: input.limit ?? 20,
    }, z.array(summarySchema)),
    read: (actor, input) => call("read_ask_conversation", {
      p_workspace_id: input.workspaceId, ...identity(actor), p_conversation_id: input.conversationId, p_limit: input.limit ?? 100,
    }, conversationSchema),
  };
}

/** In-memory adapter with the SQL rules, for tests and local previews. */
export function createInMemoryAskHistory(options: { roleOf(actor: WorkspaceActor, workspaceId: string): "owner" | "admin" | "member" | null; now?: () => string }): AskHistoryPort & { conversations: Map<string, AskConversation & { workspaceId: string; createdBy: string; createdAt: string }> } {
  const conversations = new Map<string, AskConversation & { workspaceId: string; createdBy: string; createdAt: string }>();
  const now = options.now ?? (() => new Date().toISOString());
  const role = (actor: WorkspaceActor, workspaceId: string) => {
    const value = options.roleOf(actor, workspaceId);
    if (!value) throw new WorkspaceAccessError("This business is unavailable to your account.");
    return value;
  };
  const visible = (actor: WorkspaceActor, workspaceId: string, id: string) => {
    const actorRole = role(actor, workspaceId);
    const found = conversations.get(id);
    if (!found || found.workspaceId !== workspaceId || (actorRole === "member" && found.createdBy !== actor.userId)) throw new AskConversationNotFoundError();
    return found;
  };
  return {
    conversations,
    async append(actor, input) {
      role(actor, input.workspaceId);
      if (!input.content || input.content.length > 20_000 || (input.role === "user" && input.result)) throw new WorkspaceConflictError("That message couldn't be saved.");
      let conversation = input.conversationId ? conversations.get(input.conversationId) : undefined;
      if (input.conversationId) {
        if (!conversation || conversation.workspaceId !== input.workspaceId || conversation.createdBy !== actor.userId) throw new AskConversationNotFoundError();
        if (conversation.systemId !== input.systemId) throw new WorkspaceConflictError("This conversation belongs to another place. Start a new one here.");
      } else {
        if (input.role !== "user") throw new WorkspaceConflictError("That message couldn't be saved.");
        const at = now();
        conversation = { id: crypto.randomUUID(), workspaceId: input.workspaceId, systemId: input.systemId, title: input.content.trim().replace(/\s+/g, " ").slice(0, 120), mine: true, updatedAt: at, createdAt: at, createdBy: actor.userId, messages: [] };
        conversations.set(conversation.id, conversation);
      }
      const message: AskHistoryMessage = { id: crypto.randomUUID(), seq: conversation.messages.length + 1, role: input.role, content: input.content, result: input.result ?? null, askedOnBehalf: input.askedOnBehalf ?? null, createdAt: now() };
      conversation.messages.push(message);
      conversation.updatedAt = message.createdAt;
      return { conversationId: conversation.id, messageId: message.id, seq: message.seq };
    },
    async list(actor, input) {
      const actorRole = role(actor, input.workspaceId);
      return [...conversations.values()]
        .filter((item) => item.workspaceId === input.workspaceId && (input.systemId === null || item.systemId === input.systemId) && (actorRole !== "member" || item.createdBy === actor.userId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, input.limit ?? 20)
        .map((item) => ({ id: item.id, systemId: item.systemId, title: item.title, messageCount: item.messages.length, mine: item.createdBy === actor.userId, createdAt: item.createdAt, updatedAt: item.updatedAt }));
    },
    async read(actor, input) {
      const found = visible(actor, input.workspaceId, input.conversationId);
      return { id: found.id, systemId: found.systemId, title: found.title, mine: found.createdBy === actor.userId, updatedAt: found.updatedAt, messages: found.messages.slice(-(input.limit ?? 100)) };
    },
  };
}
