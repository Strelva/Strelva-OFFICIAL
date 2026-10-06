/**
 * SSRF guard for fetches whose URL comes from tenant config (revalidateUrl,
 * capability manifest URL, custom-request endpoint). Those URLs are set by an
 * admin/owner via PATCH, so a hostile or mistaken value could point fetch() at
 * cloud metadata (169.254.169.254), localhost internal services, or a non-http
 * scheme (data:/file:). Validate the literal before fetching.
 *
 * Production is strict: https only, no private/reserved/loopback/link-local
 * hosts. Dev/test is lenient (localhost + http are how client repos are tested
 * locally). DNS-rebinding (a public host that resolves to a private IP at fetch
 * time) is NOT fully mitigated here — that needs a pinned-IP fetch agent and is
 * a deeper follow-up; this blocks the literal-target vectors, which is the bulk.
 */

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function isPrivateOrReservedHost(host: string): boolean {
  // URL.hostname keeps the brackets on an IPv6 literal ("[::1]"), which made
  // every IPv6 check below silently never match. Strip them first.
  let h = host.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);

  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata.google.internal") return true;

  // IPv6 literals contain a colon. Gate on that so a public hostname that
  // merely starts with "fc"/"fd" (e.g. fd-cdn.example.com) isn't over-blocked.
  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true; // loopback / unspecified
    if (h.startsWith("fe80:")) return true; // link-local
    // unique-local fc00::/7 — an IPv6 literal beginning fc or fd.
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    // IPv4-mapped IPv6: ::ffff:127.0.0.1 or its normalized hex ::ffff:7f00:1.
    const mappedDotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mappedDotted) return isPrivateOrReservedHost(mappedDotted[1]!);
    const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const n = ((parseInt(mappedHex[1]!, 16) << 16) | parseInt(mappedHex[2]!, 16)) >>> 0;
      const quad = `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
      return isPrivateOrReservedHost(quad);
    }
    return false; // other global IPv6 (DNS-rebinding remains out of scope)
  }

  // IPv4 literal ranges
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true; // 0.0.0.0/8
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

/** True if `raw` is safe to fetch given a tenant-supplied URL. */
export function isSafeFetchUrl(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  // Only ever http(s); blocks data:, file:, gopher:, etc.
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (isProd()) {
    if (u.protocol !== "https:") return false;
    if (isPrivateOrReservedHost(u.hostname)) return false;
  }
  return true;
}
