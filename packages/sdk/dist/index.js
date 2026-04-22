"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ChatWidget: () => ChatWidget,
  REBClient: () => REBClient,
  REBProvider: () => REBProvider,
  createREBClient: () => createREBClient,
  useREB: () => useREB,
  useREBChat: () => useREBChat,
  useREBSuggestions: () => useREBSuggestions
});
module.exports = __toCommonJS(index_exports);

// src/client.ts
var REBClient = class {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://reb.studio";
  }
  async fetch(path, options = {}) {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers
      }
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }
    return res.json();
  }
  async verifyConnection() {
    return this.fetch("/client");
  }
  async chat(request) {
    return this.fetch("/chat", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }
  async getSuggestions(request) {
    return this.fetch("/suggest", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }
  async generateReport(request) {
    return this.fetch("/report", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }
};
function createREBClient(config) {
  return new REBClient(config);
}

// src/provider.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var REBContext = (0, import_react.createContext)(null);
function REBProvider({ apiKey, baseUrl, children }) {
  const client = (0, import_react.useMemo)(
    () => createREBClient({ apiKey, baseUrl }),
    [apiKey, baseUrl]
  );
  const [clientInfo, setClientInfo] = (0, import_react.useState)(null);
  const [isLoading, setIsLoading] = (0, import_react.useState)(true);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
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
  const value = (0, import_react.useMemo)(
    () => ({
      client,
      clientInfo,
      isConnected: !!clientInfo && !error,
      isLoading,
      error
    }),
    [client, clientInfo, isLoading, error]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(REBContext.Provider, { value, children });
}
function useREB() {
  const context = (0, import_react.useContext)(REBContext);
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
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
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
  const [messages, setMessages] = (0, import_react2.useState)([]);
  const [input, setInput] = (0, import_react2.useState)("");
  const [isLoading, setIsLoading] = (0, import_react2.useState)(false);
  const messagesEndRef = (0, import_react2.useRef)(null);
  const scrollToBottom = (0, import_react2.useCallback)(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  (0, import_react2.useEffect)(() => {
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
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `reb-chat-widget reb-chat-error ${className}`, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "Unable to connect to REB. Check your API key." }) });
  }
  if (isConnecting) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `reb-chat-widget reb-chat-loading ${className}`, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "Connecting..." }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `reb-chat-widget ${className}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "reb-chat-messages", children: [
      messages.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "reb-chat-empty", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "Hi! I'm your AI assistant. Ask me to update your site, write content, or answer questions." }) }),
      messages.map((msg) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `reb-chat-message reb-chat-${msg.role}`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "reb-chat-bubble", children: msg.content }),
        msg.toolCalls && msg.toolCalls.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "reb-chat-tool-calls", children: msg.toolCalls.map((tc, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "reb-chat-tool-call", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "reb-chat-tool-name", children: tc.tool }),
          tc.tool === "update_section" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "reb-chat-tool-section", children: tc.args.section })
        ] }, i)) })
      ] }, msg.id)),
      isLoading && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "reb-chat-message reb-chat-assistant", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "reb-chat-bubble reb-chat-typing", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", {}),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", {}),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", {})
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { ref: messagesEndRef })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("form", { onSubmit: handleSubmit, className: "reb-chat-input-form", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ChatWidget,
  REBClient,
  REBProvider,
  createREBClient,
  useREB,
  useREBChat,
  useREBSuggestions
});
