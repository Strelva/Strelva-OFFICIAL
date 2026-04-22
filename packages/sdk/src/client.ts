export interface REBClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ChatRequest {
  message: string;
  content: Record<string, unknown>;
  context?: {
    siteName?: string;
    ownerName?: string;
    industry?: string;
  };
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface ChatResponse {
  response: string;
  toolCalls?: ToolCall[];
}

export interface Suggestion {
  id: string;
  type: "stale" | "missing" | "opportunity" | "engagement";
  priority: "high" | "medium" | "low";
  message: string;
  action: string;
}

export interface SuggestRequest {
  content: Record<string, unknown>;
  lastUpdated?: Record<string, string>;
  analytics?: {
    visitors?: number;
    topPages?: string[];
  };
}

export interface SuggestResponse {
  suggestions: Suggestion[];
  total: number;
}

export interface ReportRequest {
  siteName: string;
  content: Record<string, unknown>;
  analytics: {
    visitors: number;
    pageViews?: number;
    clicks?: Record<string, number>;
    topPages?: string[];
  };
  period: {
    start: string;
    end: string;
  };
}

export interface ReportResponse {
  summary: string;
  metrics: {
    visitors: number;
    pageViews?: number;
    bookingClicks: number;
    contactClicks: number;
    period: { start: string; end: string };
  };
  generatedAt: string;
}

export interface ClientInfo {
  id: string;
  name: string;
  plan: "starter" | "growth" | "scale";
  features: string[];
  active: boolean;
}

export class REBClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: REBClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://reb.studio";
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error || `Request failed: ${res.status}`);
    }

    return res.json();
  }

  async verifyConnection(): Promise<ClientInfo> {
    return this.fetch<ClientInfo>("/client");
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.fetch<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async getSuggestions(request: SuggestRequest): Promise<SuggestResponse> {
    return this.fetch<SuggestResponse>("/suggest", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async generateReport(request: ReportRequest): Promise<ReportResponse> {
    return this.fetch<ReportResponse>("/report", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }
}

export function createREBClient(config: REBClientConfig): REBClient {
  return new REBClient(config);
}
