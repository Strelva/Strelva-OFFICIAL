import * as dns from "node:dns";
import { isIP } from "node:net";
import { isPrivateOrReservedHost } from "@/platform/infra/safe-fetch";

/** A URL or DNS result that must never be sent to the public HTTP transport. */
export class UnsafePublicUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafePublicUrlError";
  }
}

export const PUBLIC_URL_VALIDATION_TIMEOUT_MS = 9_000;

export class PublicUrlValidationTimeoutError extends Error {
  constructor() {
    super("Public URL validation timed out.");
    this.name = "PublicUrlValidationTimeoutError";
  }
}

/** Bound a public-URL validation operation without changing its error types. */
export async function withPublicUrlValidationTimeout<T>(
  validate: () => Promise<T>,
  timeoutMs = PUBLIC_URL_VALIDATION_TIMEOUT_MS,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new PublicUrlValidationTimeoutError();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(validate),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new PublicUrlValidationTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** True for addresses that should never be contacted by a public fetch. */
export function isPrivateIP(ip: string): boolean {
  if (ip.includes(":")) {
    // Fail closed outside IPv6 global-unicast allocation (2000::/3), then
    // exclude known transition, reserved, and documentation ranges.
    const literal = ip.replace(/^\[|\]$/g, "");
    if (isIP(literal) !== 6) return true;
    let normalized: string;
    try {
      normalized = new URL(`http://[${literal}]/`).hostname.slice(1, -1);
    } catch {
      return true;
    }
    const segments = normalized.split(":");
    const firstWord = Number.parseInt(segments[0] || "0", 16);
    if (firstWord < 0x2000 || firstWord > 0x3fff) return true;
    const secondWord = Number.parseInt(segments[1] || "0", 16);
    if (firstWord === 0x2001 && secondWord <= 0x01ff) return true; // IETF special-purpose space
    if (firstWord === 0x2002) return true; // 6to4 can embed a private IPv4 destination
    if (firstWord === 0x3fff && secondWord <= 0x0fff) return true; // documentation range
    return isPrivateOrReservedHost(normalized);
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [p0, p1, p2] = parts as [number, number, number, number];
  if (p0 === 0 || p0 === 10 || p0 === 127 || p0 >= 224) return true;
  if (p0 === 100 && p1 >= 64 && p1 <= 127) return true; // shared address space
  if (p0 === 169 && p1 === 254) return true; // link-local and cloud metadata
  if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
  if (p0 === 192 && (p1 === 168 || (p1 === 0 && p2 === 0) || (p1 === 0 && p2 === 2) || (p1 === 88 && p2 === 99))) return true;
  if (p0 === 198 && ((p1 >= 18 && p1 <= 19) || (p1 === 51 && p2 === 100))) return true;
  if (p0 === 203 && p1 === 0 && p2 === 113) return true;
  return false;
}

/**
 * Resolve and inspect every A and AAAA answer, reject any unsafe answer, then
 * return a validated IPv4 address for the caller to pin to its socket. Keeping
 * sockets IPv4-only avoids expanding the network boundary while still
 * rejecting mixed public/private DNS answer sets.
 */
export async function validateUrlSafety(url: string): Promise<{ address: string; family: 4 }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafePublicUrlError("Blocked: invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new UnsafePublicUrlError(`Blocked: non-HTTP scheme "${parsed.protocol}"`);
  }
  if (parsed.username || parsed.password) {
    throw new UnsafePublicUrlError("Blocked: URL credentials are not allowed");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  if (literalFamily && isPrivateIP(hostname)) {
    throw new UnsafePublicUrlError(`Blocked: resolved to private IP ${hostname}`);
  }

  const answers = await dns.promises.lookup(hostname, {
    all: true,
    verbatim: true,
  });
  const addresses = Array.isArray(answers) ? answers : [answers];
  if (!addresses.length) throw new Error("Public hostname resolved to no IP addresses.");
  const unsafe = addresses.find((entry) => isPrivateIP(entry.address));
  if (unsafe) throw new UnsafePublicUrlError(`Blocked: resolved to private IP ${unsafe.address}`);
  const selected = addresses.find((entry) => entry.family === 4);
  if (!selected) throw new Error("Public hostname did not resolve to an IPv4 address.");
  return { address: selected.address, family: 4 };
}
