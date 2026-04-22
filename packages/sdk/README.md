# @reb/sdk

AI-powered website management SDK for REB platform clients.

## Installation

```bash
npm install @reb/sdk
```

## Quick Start

### 1. Set up environment

Add your REB API key to `.env.local`:

```
REB_API_KEY=reb_live_xxxxx
```

### 2. Add the Provider

```tsx
// app/providers.tsx
"use client";

import { REBProvider } from "@reb/sdk";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <REBProvider apiKey={process.env.REB_API_KEY!}>
      {children}
    </REBProvider>
  );
}
```

```tsx
// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 3. Add the Chat Widget

```tsx
// app/dashboard/page.tsx
"use client";

import { ChatWidget } from "@reb/sdk";
import { getContent, updateContent } from "@/lib/content";

export default function DashboardPage() {
  const handleToolCall = async (toolCall) => {
    if (toolCall.tool === "update_section") {
      const { section, data } = toolCall.args;
      await updateContent(section, data);
    }
  };

  return (
    <div>
      <h1>Dashboard</h1>
      <ChatWidget
        getContent={getContent}
        onToolCall={handleToolCall}
        siteName="Your Business Name"
        ownerName="Your Name"
      />
    </div>
  );
}
```

## Hooks

### useREB

Access the REB client and connection status:

```tsx
import { useREB } from "@reb/sdk";

function MyComponent() {
  const { client, clientInfo, isConnected, isLoading, error } = useREB();
  
  if (isLoading) return <p>Connecting...</p>;
  if (error) return <p>Error: {error.message}</p>;
  
  return <p>Connected as {clientInfo?.name}</p>;
}
```

### useREBChat

Send messages to the AI:

```tsx
import { useREBChat } from "@reb/sdk";

function ChatInput() {
  const { sendMessage, isConnected } = useREBChat();
  
  const handleSend = async (message: string, content: Record<string, unknown>) => {
    const response = await sendMessage(message, content);
    console.log(response.response);
    console.log(response.toolCalls); // AI's proposed changes
  };
}
```

### useREBSuggestions

Get proactive suggestions:

```tsx
import { useREBSuggestions } from "@reb/sdk";

function Suggestions() {
  const { getSuggestions } = useREBSuggestions();
  
  useEffect(() => {
    getSuggestions(content, lastUpdated).then(({ suggestions }) => {
      // Show suggestions to user
    });
  }, []);
}
```

## API Client (Server-side)

For server-side usage without React:

```ts
import { createREBClient } from "@reb/sdk/client";

const client = createREBClient({
  apiKey: process.env.REB_API_KEY!,
});

// Verify connection
const info = await client.verifyConnection();

// Chat
const response = await client.chat({
  message: "Update my hours to 9-5",
  content: currentSiteContent,
});

// Get suggestions
const { suggestions } = await client.getSuggestions({
  content: currentSiteContent,
  lastUpdated: { hero: "2024-01-01", services: "2024-02-15" },
});

// Generate report
const report = await client.generateReport({
  siteName: "My Business",
  content: currentSiteContent,
  analytics: { visitors: 150, clicks: { booking: 12 } },
  period: { start: "2024-03-01", end: "2024-03-07" },
});
```

## Styling

The ChatWidget comes unstyled. Add your own CSS:

```css
.reb-chat-widget {
  display: flex;
  flex-direction: column;
  height: 400px;
  border: 1px solid #ccc;
  border-radius: 8px;
}

.reb-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.reb-chat-message {
  margin-bottom: 0.5rem;
}

.reb-chat-user .reb-chat-bubble {
  background: #007bff;
  color: white;
  margin-left: auto;
}

.reb-chat-assistant .reb-chat-bubble {
  background: #f1f1f1;
}

.reb-chat-bubble {
  padding: 0.5rem 1rem;
  border-radius: 1rem;
  max-width: 80%;
  display: inline-block;
}

.reb-chat-input-form {
  display: flex;
  padding: 0.5rem;
  border-top: 1px solid #ccc;
}

.reb-chat-input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.reb-chat-send {
  margin-left: 0.5rem;
  padding: 0.5rem 1rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
```

## API Reference

### POST /api/v1/chat

AI chat endpoint.

**Request:**
```json
{
  "message": "Update my business hours",
  "content": { "contact": { "hours": "9-5" }, ... },
  "context": { "siteName": "My Biz", "ownerName": "Amy" }
}
```

**Response:**
```json
{
  "response": "I'll update your hours. Here's what I'm changing...",
  "toolCalls": [{
    "tool": "update_section",
    "args": { "section": "contact", "data": {...}, "reason": "..." },
    "result": { "proposed": true, ... }
  }]
}
```

### POST /api/v1/suggest

Get proactive suggestions.

### POST /api/v1/report

Generate weekly report.

### GET /api/v1/client

Verify API key and get client info.
