import * as dns from "node:dns";

export function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [p0, p1] = parts;
  if (p0 === 0) return true;
  if (p0 === 10) return true;
  if (p0 === 100 && p1 !== undefined && p1 >= 64 && p1 <= 127) return true;
  if (p0 === 127) return true;
  if (p0 === 169 && p1 === 254) return true;
  if (p0 === 172 && p1 !== undefined && p1 >= 16 && p1 <= 31) return true;
  if (p0 === 192 && p1 === 168) return true;
  if (p0 === 198 && p1 !== undefined && p1 >= 18 && p1 <= 19) return true;
  return false;
}

export async function validateUrlSafety(url: string): Promise<{ address: string }> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Blocked: non-HTTP scheme "${parsed.protocol}"`);
  }
  // Force IPv4 to prevent IPv6 SSRF bypass (::1, ::ffff:127.0.0.1, fe80::, etc.)
  const { address } = await dns.promises.lookup(parsed.hostname, { family: 4 });
  if (isPrivateIP(address)) {
    throw new Error(`Blocked: resolved to private IP ${address}`);
  }
  return { address };
}

