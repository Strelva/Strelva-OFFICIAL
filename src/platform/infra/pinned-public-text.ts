import { request as httpRequest, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { type LookupFunction } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { UnsafePublicUrlError, validateUrlSafety } from "@/platform/infra/public-url-safety";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_REDIRECT_LIMIT = 5;

export interface PinnedPublicTextOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  allowUrl?: (url: string) => boolean | Promise<boolean>;
}

export interface PinnedPublicResponse {
  /** Final URL after every redirect hop passed URL and DNS validation. */
  url: string;
  status: number;
  headers: Headers;
  body: Buffer;
}

type HopResult =
  | { redirect: string }
  | { status: number; headers: Headers; body: Buffer }
  | null;

class PublicFetchDeadlineError extends Error {
  constructor() {
    super("Public fetch deadline exceeded");
    this.name = "PublicFetchDeadlineError";
  }
}

function header(response: IncomingMessage, name: string): string {
  const value = response.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function toHeaders(response: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else headers.set(name, String(value));
  }
  return headers;
}

function mergeHeaders(
  defaults: Record<string, string>,
  overrides: Record<string, string> = {},
): Record<string, string> {
  const merged = new Map<string, string>();
  for (const source of [defaults, overrides]) {
    for (const [name, value] of Object.entries(source)) merged.set(name.toLowerCase(), value);
  }
  return Object.fromEntries(merged);
}

function decodeBody(body: Buffer, encodingHeader: string, maxBytes: number): Buffer | null {
  let decoded = body;
  const encodings = encodingHeader.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  for (const encoding of encodings.reverse()) {
    try {
      if (encoding === "identity") continue;
      if (encoding === "gzip" || encoding === "x-gzip") decoded = gunzipSync(decoded, { maxOutputLength: maxBytes });
      else if (encoding === "deflate") decoded = inflateSync(decoded, { maxOutputLength: maxBytes });
      else if (encoding === "br") decoded = brotliDecompressSync(decoded, { maxOutputLength: maxBytes });
      else return null;
    } catch {
      return null;
    }
    if (decoded.byteLength > maxBytes) return null;
  }
  return decoded.byteLength <= maxBytes ? decoded : null;
}

/**
 * One bounded request to a DNS address that already passed validation. TLS
 * keeps the original hostname for SNI and certificate verification.
 */
function requestPinnedHop(
  url: URL,
  address: string,
  family: 4,
  options: { timeoutMs: number; maxBytes: number; headers: Record<string, string> },
): Promise<HopResult> {
  return new Promise((resolve) => {
    let settled = false;
    const timerState: { id?: ReturnType<typeof setTimeout> } = {};
    const finish = (value: HopResult) => {
      if (settled) return;
      settled = true;
      if (timerState.id) clearTimeout(timerState.id);
      resolve(value);
    };
    const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
      if (typeof lookupOptions === "object" && lookupOptions.all) {
        callback(null, [{ address, family }]);
        return;
      }
      callback(null, address, family);
    };
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const requestOptions: RequestOptions & { autoSelectFamily: false } = {
      method: "GET",
      lookup,
      family,
      autoSelectFamily: false,
      headers: options.headers,
    };
    let request: ClientRequest;
    try {
      request = transport(url, requestOptions, (response) => {
        const status = response.statusCode ?? 0;
        const location = header(response, "location");
        if (REDIRECT_STATUSES.has(status) && location) {
          finish({ redirect: location });
          response.destroy();
          request.destroy();
          return;
        }

        const responseHeaders = toHeaders(response);
        const declaredLength = Number(header(response, "content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
          finish(null);
          response.destroy();
          request.destroy();
          return;
        }

        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.byteLength;
          if (bytes > options.maxBytes) {
            finish(null);
            response.destroy();
            request.destroy();
            return;
          }
          chunks.push(buffer);
        });
        response.once("end", () => finish({ status, headers: responseHeaders, body: Buffer.concat(chunks) }));
        response.once("error", () => finish(null));
        response.once("aborted", () => finish(null));
      });
    } catch {
      finish(null);
      return;
    }
    if (!settled) {
      timerState.id = setTimeout(() => {
        request.destroy();
        finish(null);
      }, options.timeoutMs);
    }
    request.once("error", () => finish(null));
    try {
      request.end();
    } catch {
      finish(null);
    }
  });
}

async function beforeDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new PublicFetchDeadlineError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new PublicFetchDeadlineError()), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Validate and pin each hop, following only a bounded chain of public redirects. */
export async function fetchPinnedPublicResponse(
  rawUrl: string,
  options: PinnedPublicTextOptions = {},
): Promise<PinnedPublicResponse | null> {
  const resolvedOptions = {
    timeoutMs: options.timeoutMs ?? 9_000,
    maxBytes: options.maxBytes ?? 1_000_000,
    maxRedirects: Math.max(0, Math.min(10, Math.floor(options.maxRedirects ?? DEFAULT_REDIRECT_LIMIT))),
    headers: mergeHeaders({
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
      "accept-encoding": "identity",
      "user-agent": options.userAgent ?? "StrelvaPublicFetch/1.0 (+https://strelva.com)",
    }, options.headers),
  };
  const deadline = Date.now() + resolvedOptions.timeoutMs;
  let current = rawUrl;

  for (let redirectCount = 0; redirectCount <= resolvedOptions.maxRedirects; redirectCount += 1) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      return null;
    }
    url.hash = "";
    if (options.allowUrl) {
      try {
        const allowed = await beforeDeadline(Promise.resolve().then(() => options.allowUrl!(url.toString())), deadline);
        if (!allowed) return null;
      } catch (error) {
        if (error instanceof PublicFetchDeadlineError) return null;
        throw error;
      }
    }

    let address: string;
    let family: 4;
    try {
      ({ address, family } = await beforeDeadline(validateUrlSafety(url.toString()), deadline));
    } catch (error) {
      if (error instanceof UnsafePublicUrlError) throw error;
      return null;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const result = await requestPinnedHop(url, address, family, {
      ...resolvedOptions,
      timeoutMs: remaining,
    });
    if (!result) return null;
    if ("redirect" in result) {
      if (redirectCount === resolvedOptions.maxRedirects) return null;
      try {
        current = new URL(result.redirect, url).toString();
      } catch {
        return null;
      }
      continue;
    }
    const body = decodeBody(result.body, result.headers.get("content-encoding") ?? "", resolvedOptions.maxBytes);
    if (!body) return null;
    return { url: url.toString(), status: result.status, headers: result.headers, body };
  }
  return null;
}

/** Bounded HTML/text fetch used by public-source readers. */
export async function fetchPinnedPublicText(
  rawUrl: string,
  options: PinnedPublicTextOptions = {},
): Promise<string | null> {
  try {
    const response = await fetchPinnedPublicResponse(rawUrl, options);
    if (!response || response.status < 200 || response.status >= 300) return null;
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !/^(text\/|application\/xhtml\+xml\b)/.test(contentType)) return null;
    return response.body.toString("utf8");
  } catch {
    return null;
  }
}
