interface REBClientConfig {
    apiKey: string;
    baseUrl?: string;
}
interface ChatRequest {
    message: string;
    content: Record<string, unknown>;
    context?: {
        siteName?: string;
        ownerName?: string;
        industry?: string;
    };
}
interface ToolCall {
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
}
interface ChatResponse {
    response: string;
    toolCalls?: ToolCall[];
}
interface Suggestion {
    id: string;
    type: "stale" | "missing" | "opportunity" | "engagement";
    priority: "high" | "medium" | "low";
    message: string;
    action: string;
}
interface SuggestRequest {
    content: Record<string, unknown>;
    lastUpdated?: Record<string, string>;
    analytics?: {
        visitors?: number;
        topPages?: string[];
    };
}
interface SuggestResponse {
    suggestions: Suggestion[];
    total: number;
}
interface ReportRequest {
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
interface ReportResponse {
    summary: string;
    metrics: {
        visitors: number;
        pageViews?: number;
        bookingClicks: number;
        contactClicks: number;
        period: {
            start: string;
            end: string;
        };
    };
    generatedAt: string;
}
interface ClientInfo {
    id: string;
    name: string;
    plan: "starter" | "growth" | "scale";
    features: string[];
    active: boolean;
}
declare class REBClient {
    private apiKey;
    private baseUrl;
    constructor(config: REBClientConfig);
    private fetch;
    verifyConnection(): Promise<ClientInfo>;
    chat(request: ChatRequest): Promise<ChatResponse>;
    getSuggestions(request: SuggestRequest): Promise<SuggestResponse>;
    generateReport(request: ReportRequest): Promise<ReportResponse>;
}
declare function createREBClient(config: REBClientConfig): REBClient;

export { type ChatRequest, type ChatResponse, type ClientInfo, REBClient, type REBClientConfig, type ReportRequest, type ReportResponse, type SuggestRequest, type SuggestResponse, type Suggestion, type ToolCall, createREBClient };
