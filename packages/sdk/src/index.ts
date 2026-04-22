// Client
export { REBClient, createREBClient } from "./client";
export type {
  REBClientConfig,
  ChatRequest,
  ChatResponse,
  ToolCall,
  Suggestion,
  SuggestRequest,
  SuggestResponse,
  ReportRequest,
  ReportResponse,
  ClientInfo,
} from "./client";

// React Provider & Hooks
export { REBProvider, useREB, useREBChat, useREBSuggestions } from "./provider";
export type { REBProviderProps } from "./provider";

// Components
export { ChatWidget } from "./chat-widget";
export type { ChatWidgetProps, ChatMessage } from "./chat-widget";
