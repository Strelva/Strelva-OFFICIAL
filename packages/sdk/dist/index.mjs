import {
  REBClient,
  createREBClient
} from "./chunk-7QCEFTWI.mjs";

// src/provider.tsx
import { createContext, useContext, useMemo, useEffect, useState } from "react";
import { jsx } from "react/jsx-runtime";
var REBContext = createContext(null);
function REBProvider({ apiKey, baseUrl, children }) {
  const client = useMemo(
    () => createREBClient({ apiKey, baseUrl }),
    [apiKey, baseUrl]
  );
  const [clientInfo, setClientInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    client.verifyConnection().then((info) => {
      setClientInfo(info);
      setError(null);
    }).catch((err) => {
      setError(err);
      console.error("[REB SDK] Connection failed:", err);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [client]);
  const value = useMemo(
    () => ({
      client,
      clientInfo,
      isConnected: !!clientInfo && !error,
      isLoading,
      error
    }),
    [client, clientInfo, isLoading, error]
  );
  return /* @__PURE__ */ jsx(REBContext.Provider, { value, children });
}
function useREB() {
  const context = useContext(REBContext);
  if (!context) {
    throw new Error("useREB must be used within a REBProvider");
  }
  return context;
}
function useREBChat() {
  const { client, isConnected } = useREB();
  const sendMessage = async (message, content, context) => {
    if (!isConnected) {
      throw new Error("REB client not connected");
    }
    return client.chat({ message, content, context });
  };
  return { sendMessage, isConnected };
}
function useREBSuggestions() {
  const { client, isConnected } = useREB();
  const getSuggestions = async (content, lastUpdated) => {
    if (!isConnected) {
      throw new Error("REB client not connected");
    }
    return client.getSuggestions({ content, lastUpdated });
  };
  return { getSuggestions, isConnected };
}

// src/chat-widget.tsx
import { useState as useState2, useRef, useEffect as useEffect2, useCallback } from "react";
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function ChatWidget({
  getContent,
  onToolCall,
  siteName,
  ownerName,
  placeholder = "Ask me anything about your site...",
  className = ""
}) {
  const { isConnected, isLoading: isConnecting, error: connectionError } = useREB();
  const { sendMessage } = useREBChat();
  const [messages, setMessages] = useState2([]);
  const [input, setInput] = useState2("");
  const [isLoading, setIsLoading] = useState2(false);
  const messagesEndRef = useRef(null);
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useEffect2(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !isConnected) return;
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: /* @__PURE__ */ new Date()
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    try {
      const content = await getContent();
      const response = await sendMessage(input.trim(), content, { siteName, ownerName });
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.response,
        toolCalls: response.toolCalls,
        timestamp: /* @__PURE__ */ new Date()
      };
      setMessages((prev) => [...prev, assistantMessage]);
      if (response.toolCalls && onToolCall) {
        for (const toolCall of response.toolCalls) {
          await onToolCall(toolCall);
        }
      }
    } catch (err) {
      const errorMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        timestamp: /* @__PURE__ */ new Date()
      };
      setMessages((prev) => [...prev, errorMessage]);
      console.error("[ChatWidget] Error:", err);
    } finally {
      setIsLoading(false);
    }
  };
  if (connectionError) {
    return /* @__PURE__ */ jsx2("div", { className: `reb-chat-widget reb-chat-error ${className}`, children: /* @__PURE__ */ jsx2("p", { children: "Unable to connect to REB. Check your API key." }) });
  }
  if (isConnecting) {
    return /* @__PURE__ */ jsx2("div", { className: `reb-chat-widget reb-chat-loading ${className}`, children: /* @__PURE__ */ jsx2("p", { children: "Connecting..." }) });
  }
  return /* @__PURE__ */ jsxs("div", { className: `reb-chat-widget ${className}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "reb-chat-messages", children: [
      messages.length === 0 && /* @__PURE__ */ jsx2("div", { className: "reb-chat-empty", children: /* @__PURE__ */ jsx2("p", { children: "Hi! I'm your AI assistant. Ask me to update your site, write content, or answer questions." }) }),
      messages.map((msg) => /* @__PURE__ */ jsxs("div", { className: `reb-chat-message reb-chat-${msg.role}`, children: [
        /* @__PURE__ */ jsx2("div", { className: "reb-chat-bubble", children: msg.content }),
        msg.toolCalls && msg.toolCalls.length > 0 && /* @__PURE__ */ jsx2("div", { className: "reb-chat-tool-calls", children: msg.toolCalls.map((tc, i) => /* @__PURE__ */ jsxs("div", { className: "reb-chat-tool-call", children: [
          /* @__PURE__ */ jsx2("span", { className: "reb-chat-tool-name", children: tc.tool }),
          tc.tool === "update_section" && /* @__PURE__ */ jsx2("span", { className: "reb-chat-tool-section", children: tc.args.section })
        ] }, i)) })
      ] }, msg.id)),
      isLoading && /* @__PURE__ */ jsx2("div", { className: "reb-chat-message reb-chat-assistant", children: /* @__PURE__ */ jsxs("div", { className: "reb-chat-bubble reb-chat-typing", children: [
        /* @__PURE__ */ jsx2("span", {}),
        /* @__PURE__ */ jsx2("span", {}),
        /* @__PURE__ */ jsx2("span", {})
      ] }) }),
      /* @__PURE__ */ jsx2("div", { ref: messagesEndRef })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "reb-chat-input-form", children: [
      /* @__PURE__ */ jsx2(
        "input",
        {
          type: "text",
          value: input,
          onChange: (e) => setInput(e.target.value),
          placeholder,
          disabled: isLoading || !isConnected,
          className: "reb-chat-input"
        }
      ),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "submit",
          disabled: isLoading || !input.trim() || !isConnected,
          className: "reb-chat-send",
          children: "Send"
        }
      )
    ] })
  ] });
}
export {
  ChatWidget,
  REBClient,
  REBProvider,
  createREBClient,
  useREB,
  useREBChat,
  useREBSuggestions
};
