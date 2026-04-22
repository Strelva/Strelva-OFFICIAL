import { REBClient, ClientInfo, ChatResponse, SuggestResponse, ToolCall } from './client.js';
export { ChatRequest, REBClientConfig, ReportRequest, ReportResponse, SuggestRequest, Suggestion, createREBClient } from './client.js';
import * as react_jsx_runtime from 'react/jsx-runtime';
import React from 'react';

interface REBContextValue {
    client: REBClient;
    clientInfo: ClientInfo | null;
    isConnected: boolean;
    isLoading: boolean;
    error: Error | null;
}
interface REBProviderProps {
    apiKey: string;
    baseUrl?: string;
    children: React.ReactNode;
}
declare function REBProvider({ apiKey, baseUrl, children }: REBProviderProps): react_jsx_runtime.JSX.Element;
declare function useREB(): REBContextValue;
declare function useREBChat(): {
    sendMessage: (message: string, content: Record<string, unknown>, context?: {
        siteName?: string;
        ownerName?: string;
    }) => Promise<ChatResponse>;
    isConnected: boolean;
};
declare function useREBSuggestions(): {
    getSuggestions: (content: Record<string, unknown>, lastUpdated?: Record<string, string>) => Promise<SuggestResponse>;
    isConnected: boolean;
};

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    toolCalls?: ToolCall[];
    timestamp: Date;
}
interface ChatWidgetProps {
    getContent: () => Promise<Record<string, unknown>> | Record<string, unknown>;
    onToolCall?: (toolCall: ToolCall) => Promise<void> | void;
    siteName?: string;
    ownerName?: string;
    placeholder?: string;
    className?: string;
}
declare function ChatWidget({ getContent, onToolCall, siteName, ownerName, placeholder, className, }: ChatWidgetProps): react_jsx_runtime.JSX.Element;

export { type ChatMessage, ChatResponse, ChatWidget, type ChatWidgetProps, ClientInfo, REBClient, REBProvider, type REBProviderProps, SuggestResponse, ToolCall, useREB, useREBChat, useREBSuggestions };
