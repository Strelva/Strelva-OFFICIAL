/** Which hosted assistant's published egress a request came from. A match is
 * a shared-bucket signal (many users behind one address), never an identity
 * and never an exemption from hold or email caps. */
import { PROVIDER_EGRESS } from "./provider-egress-data";

export type EgressProvider = keyof typeof PROVIDER_EGRESS;

function ipv4(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    n = n * 256 + Number(part);
  }
  return n;
}

type Range = { provider: EgressProvider; base: number; size: number };
const ranges: Range[] = Object.entries(PROVIDER_EGRESS).flatMap(([provider, list]) => list.ipv4.map(cidr => {
  const [address, bits] = cidr.split("/");
  const size = 2 ** (32 - Number(bits));
  const base = ipv4(address ?? "");
  if (base === null || !Number.isInteger(size)) throw new Error(`provider_egress_invalid:${cidr}`);
  return { provider: provider as EgressProvider, base: base - (base % size), size };
}));

/** The provider whose published range contains this address (IPv4, or IPv4-mapped IPv6). */
export function egressProvider(ip: string | null): EgressProvider | null {
  if (!ip) return null;
  const n = ipv4(ip.replace(/^::ffff:/i, ""));
  if (n === null) return null;
  return ranges.find(r => n >= r.base && n < r.base + r.size)?.provider ?? null;
}

/** The first x-forwarded-for hop, as the existing limiter reads it, or null. */
export function clientIp(request: Request): string | null {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && first.length <= 64 && /^[0-9a-fA-F:.]+$/.test(first) ? first : null;
}
