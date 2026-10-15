import { GHL_API_BASE, GHL_API_VERSION, GHL_BURST_LIMIT, GHL_BURST_WINDOW_MS } from "./config";

/**
 * A small HighLevel API client: paced under the documented burst limit,
 * retries what can be retried, and turns refusals into errors an agency can
 * act on. Reads only. Uses fetch; no SDK.
 */

export type GhlErrorCode =
  /** The agency removed the app or the grant no longer works. Reconnect. */
  | "revoked"
  /** HighLevel refused a read: a missing scope, or a plan without API access. */
  | "insufficient_access"
  /** Still limited after every retry. */
  | "rate_limited"
  /** HighLevel failed or could not be reached after every retry. */
  | "unavailable"
  /** The Marketplace app credentials are not set in this environment. */
  | "not_configured"
  /** HighLevel answered with something we could not read. */
  | "malformed";

export class GhlApiError extends Error {
  constructor(message: string, readonly code: GhlErrorCode, readonly status?: number) {
    super(message);
    this.name = "GhlApiError";
  }
}

export const GHL_MESSAGES: Record<GhlErrorCode, string> = {
  revoked: "Your HighLevel connection no longer works. Connect HighLevel again to import clients.",
  insufficient_access: "HighLevel didn't allow Strelva to read your sub-accounts. Reconnect and approve every requested access, and check that your HighLevel plan includes API access.",
  rate_limited: "HighLevel asked Strelva to slow down. Nothing was added. Try the import again in a minute.",
  unavailable: "HighLevel couldn't be reached. Nothing was added. Try again shortly.",
  not_configured: "HighLevel isn't set up on Strelva yet.",
  malformed: "HighLevel sent something Strelva couldn't read. Nothing was added.",
};

export type GhlFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Where the agency token comes from. `refresh` is called at most once per request, after a 401. */
export interface GhlTokenSource {
  accessToken(): Promise<string>;
  refresh(): Promise<string>;
}

/**
 * Sliding-window pacer per resource (a Company or a Location id), because
 * HighLevel counts the burst per app per resource. Also obeys the
 * X-RateLimit-Remaining / X-RateLimit-Interval-Milliseconds headers.
 * In-process only: one import runs inside one request. Two concurrent imports
 * for the same agency could still together exceed the burst; the 429 retry
 * below absorbs that.
 */
export class GhlPacer {
  private readonly sent = new Map<string, number[]>();
  private readonly blockedUntil = new Map<string, number>();

  constructor(
    private readonly clock: { now(): number; sleep(ms: number): Promise<void> },
    private readonly limit = Math.floor(GHL_BURST_LIMIT * 0.9),
    private readonly windowMs = GHL_BURST_WINDOW_MS,
  ) {}

  async acquire(resource: string): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      const blocked = this.blockedUntil.get(resource) ?? 0;
      if (blocked > now) {
        await this.clock.sleep(blocked - now);
        continue;
      }
      const recent = (this.sent.get(resource) ?? []).filter((at) => at > now - this.windowMs);
      if (recent.length < this.limit) {
        recent.push(now);
        this.sent.set(resource, recent);
        return;
      }
      this.sent.set(resource, recent);
      await this.clock.sleep(Math.max(1, recent[0]! + this.windowMs - now));
    }
  }

  observe(resource: string, headers: Headers): void {
    const remaining = Number(headers.get("x-ratelimit-remaining"));
    if (headers.get("x-ratelimit-remaining") !== null && Number.isFinite(remaining) && remaining <= 0) {
      const interval = Number(headers.get("x-ratelimit-interval-milliseconds"));
      const wait = Number.isFinite(interval) && interval > 0 ? interval : this.windowMs;
      this.blockedUntil.set(resource, this.clock.now() + wait);
    }
  }
}

export interface GhlClientOptions {
  tokens: GhlTokenSource;
  fetcher?: GhlFetch;
  pacer?: GhlPacer;
  clock?: { now(): number; sleep(ms: number): Promise<void> };
  /** Total attempts for one request, including the first. */
  maxAttempts?: number;
  baseDelayMs?: number;
}

const realClock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) };

function retryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, Math.min(at - Date.now(), 60_000)) : null;
}

/**
 * HighLevel answers a token without the needed scope with 401 and a message
 * like "The token is not authorized for this scope." (UNVERIFIED against a
 * live call; community reports). That is a permission problem, not a revoked
 * grant, so refreshing will not help.
 */
function isScopeRefusal(body: unknown): boolean {
  const message = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : "";
  return /not authorized for this scope|scope|plan|access to this location/i.test(message);
}

export class GhlClient {
  private readonly fetcher: GhlFetch;
  private readonly clock: { now(): number; sleep(ms: number): Promise<void> };
  private readonly pacer: GhlPacer;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(private readonly options: GhlClientOptions) {
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    this.clock = options.clock ?? realClock;
    this.pacer = options.pacer ?? new GhlPacer(this.clock);
    this.maxAttempts = options.maxAttempts ?? 4;
    this.baseDelayMs = options.baseDelayMs ?? 500;
  }

  private backoff(attempt: number): number {
    return Math.min(this.baseDelayMs * 2 ** (attempt - 1), 8_000);
  }

  /** GET a HighLevel path as the agency. `resource` is the Company or Location id the call counts against. */
  async get<T = unknown>(path: string, query: Record<string, string | undefined>, resource: string): Promise<T> {
    const url = new URL(path, GHL_API_BASE);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
    let token = await this.options.tokens.accessToken();
    let refreshed = false;
    for (let attempt = 1; ; attempt += 1) {
      await this.pacer.acquire(resource);
      let response: Response;
      try {
        response = await this.fetcher(url.toString(), {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, Version: GHL_API_VERSION, Accept: "application/json" },
        });
      } catch {
        if (attempt >= this.maxAttempts) throw new GhlApiError(GHL_MESSAGES.unavailable, "unavailable");
        await this.clock.sleep(this.backoff(attempt));
        continue;
      }
      this.pacer.observe(resource, response.headers);
      if (response.ok) {
        try {
          return await response.json() as T;
        } catch {
          throw new GhlApiError(GHL_MESSAGES.malformed, "malformed", response.status);
        }
      }
      const body = await response.json().catch(() => null);
      if (response.status === 401) {
        if (isScopeRefusal(body)) throw new GhlApiError(GHL_MESSAGES.insufficient_access, "insufficient_access", 401);
        if (!refreshed) {
          refreshed = true;
          token = await this.options.tokens.refresh();
          continue;
        }
        throw new GhlApiError(GHL_MESSAGES.revoked, "revoked", 401);
      }
      if (response.status === 403) throw new GhlApiError(GHL_MESSAGES.insufficient_access, "insufficient_access", 403);
      if (response.status === 429) {
        if (attempt >= this.maxAttempts) throw new GhlApiError(GHL_MESSAGES.rate_limited, "rate_limited", 429);
        await this.clock.sleep(retryAfterMs(response.headers) ?? this.backoff(attempt) * 2);
        continue;
      }
      if (response.status >= 500 || response.status === 408) {
        if (attempt >= this.maxAttempts) throw new GhlApiError(GHL_MESSAGES.unavailable, "unavailable", response.status);
        await this.clock.sleep(this.backoff(attempt));
        continue;
      }
      throw new GhlApiError(GHL_MESSAGES.malformed, "malformed", response.status);
    }
  }
}
