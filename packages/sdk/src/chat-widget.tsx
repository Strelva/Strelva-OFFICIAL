"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useREB, useREBChat } from "./provider";
import type { ToolCall } from "./client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  timestamp: Date;
}

export interface ChatWidgetProps {
  getContent: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  onToolCall?: (toolCall: ToolCall) => Promise<void> | void;
  siteName?: string;
  ownerName?: string;
  placeholder?: string;
  className?: string;
}

export function ChatWidget({
  getContent,
  onToolCall,
  siteName,
  ownerName,
  placeholder = "Ask me anything about your site...",
  className = "",
}: ChatWidgetProps) {
  const { isConnected, isLoading: isConnecting, error: connectionError } = useREB();
  const { sendMessage } = useREBChat();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !isConnected) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const content = await getContent();
      const response = await sendMessage(input.trim(), content, { siteName, ownerName });

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.response,
        toolCalls: response.toolCalls,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (response.toolCalls && onToolCall) {
        for (const toolCall of response.toolCalls) {
          await onToolCall(toolCall);
        }
      }
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      console.error("[ChatWidget] Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (connectionError) {
    return (
      <div className={`reb-chat-widget reb-chat-error ${className}`}>
        <p>Unable to connect to REB. Check your API key.</p>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className={`reb-chat-widget reb-chat-loading ${className}`}>
        <p>Connecting...</p>
      </div>
    );
  }

  return (
    <div className={`reb-chat-widget ${className}`}>
      <div className="reb-chat-messages">
        {messages.length === 0 && (
          <div className="reb-chat-empty">
            <p>Hi! I'm your AI assistant. Ask me to update your site, write content, or answer questions.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`reb-chat-message reb-chat-${msg.role}`}>
            <div className="reb-chat-bubble">{msg.content}</div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="reb-chat-tool-calls">
                {msg.toolCalls.map((tc, i) => (
                  <div key={i} className="reb-chat-tool-call">
                    <span className="reb-chat-tool-name">{tc.tool}</span>
                    {tc.tool === "update_section" && (
                      <span className="reb-chat-tool-section">
                        {(tc.args as { section?: string }).section}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="reb-chat-message reb-chat-assistant">
            <div className="reb-chat-bubble reb-chat-typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="reb-chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={isLoading || !isConnected}
          className="reb-chat-input"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim() || !isConnected}
          className="reb-chat-send"
        >
          Send
        </button>
      </form>
    </div>
  );
}
