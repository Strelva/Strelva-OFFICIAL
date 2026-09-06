import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { validateUrlSafety } from "@/lib/audit/checks";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_REDIRECT_LIMIT = 5;

export interface PinnedPublicTextOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
}

type HopResult = { redirect?: string; text?: string } | null;

function header(response: IncomingMessage, name: string): string {
  const value = response.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/**
 * Request one URL while pinning the socket lookup to the exact public IPv4
 * address that passed validation. TLS still uses the URL hostname for SNI and
 * certificate checks. This closes the validate-then-resolve-again gap in
 * standard fetch without adding a third-party transport.
 */
function requestPinnedHop(
  url: URL,
  address: string,
  options: Required<Pick<PinnedPublicTextOptions, "timeoutMs" | "maxBytes" | "userAgent">>,
): Promise<HopResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: HopResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
      if (typeof lookupOptions === "object" && lookupOptions.all) {
        callback(null, [{ address, family: 4 }]);
        return;
      }
      callback(null, address, 4);
    };
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport(url, {
      method: "GET",
      lookup,
      family: 4,
      ...{ autoSelectFamily: false },
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        "user-agent": options.userAgent,
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (REDIRECT_STATUSES.has(status)) {
        const location = header(response, "location");
        finish(location ? { redirect: location } : null);
        response.destroy();
        request.destroy();
        return;
      }
      if (status < 200 || status >= 300) {
        finish(null);
        response.destroy();
        request.destroy();
        return;
      }

      const contentType = header(response, "content-type").toLowerCase();
      if (contentType && !/^(text\/|application\/xhtml\+xml\b)/.test(contentType)) {
        finish(null);
        response.destroy();
        request.destroy();
        return;
      }
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
      response.once("end", () => finish({ text: Buffer.concat(chunks).toString("utf8") }));
      response.once("error", () => finish(null));
      response.once("aborted", () => finish(null));
    });
    request.once("error", () => finish(null));
    const timer = setTimeout(() => {
      request.destroy();
      finish(null);
    }, options.timeoutMs);
    request.end();
  });
}

async function beforeDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Public fetch deadline exceeded");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Public fetch deadline exceeded")), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Validate, pin, and fetch every HTTP redirect hop with bounded output. */
export async function fetchPinnedPublicText(
  rawUrl: string,
  options: PinnedPublicTextOptions = {},
): Promise<string | null> {
  const resolvedOptions = {
    timeoutMs: options.timeoutMs ?? 9_000,
    maxBytes: options.maxBytes ?? 1_000_000,
    maxRedirects: options.maxRedirects ?? DEFAULT_REDIRECT_LIMIT,
    userAgent: options.userAgent ?? "StrelvaPublicFetch/1.0 (+https://strelva.com)",
  };
  let current = rawUrl;
  const deadline = Date.now() + resolvedOptions.timeoutMs;

  for (let redirectCount = 0; redirectCount <= resolvedOptions.maxRedirects; redirectCount += 1) {
    let url: URL;
    let address: string;
    try {
      url = new URL(current);
      if (url.username || url.password) return null;
      ({ address } = await beforeDeadline(validateUrlSafety(url.toString()), deadline));
    } catch {
      return null;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const result = await requestPinnedHop(url, address, {
      ...resolvedOptions,
      timeoutMs: remaining,
    });
    if (!result) return null;
    if (result.text !== undefined) return result.text;
    if (!result.redirect || redirectCount === resolvedOptions.maxRedirects) return null;
    try {
      current = new URL(result.redirect, url).toString();
    } catch {
      return null;
    }
  }
  return null;
}
