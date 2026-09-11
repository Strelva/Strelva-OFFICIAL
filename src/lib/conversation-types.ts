/**
 * Browser-safe conversation records.
 *
 * Conversation persistence lives in `threads.ts`; these types stay neutral so
 * product navigation and API contracts do not import a persistence component.
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: unknown[];
  toolResults?: unknown[];
}

export interface Thread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

/**
 * The compact row returned to navigation surfaces.  It is intentionally not
 * the persisted Thread record: list responses may include a derived preview,
 * while persistence owns the full message history.
 */
export interface ThreadSummary {
  id: string;
  title: string;
  preview?: string;
  updatedAt: string | number;
}
