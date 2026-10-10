import type { LookupFunction } from "node:net";

/**
 * Socket lookup pinned to one IPv4 address that already passed
 * `validateUrlSafety`. Node's connection path may ask with `{ all: true }`
 * (family autoselection); answering that with a bare string fails with
 * ERR_INVALID_IP_ADDRESS before any connection, so both shapes are honored.
 * Pair it with `family: 4` and `autoSelectFamily: false` on the request.
 */
export function pinnedLookup(address: string): LookupFunction {
  return (_hostname, options, callback) => {
    if (typeof options === "object" && options?.all) {
      (callback as unknown as (error: null, addresses: Array<{ address: string; family: number }>) => void)(null, [{ address, family: 4 }]);
      return;
    }
    callback(null, address, 4);
  };
}

/** Request options that keep every hop on the pinned, validated IPv4 address. */
export function pinnedRequestOptions(address: string) {
  return { lookup: pinnedLookup(address), family: 4, autoSelectFamily: false } as const;
}

/** Strict public IPv4 target for unauthenticated metadata fetches. Includes
 * IANA special-use/documentation networks; DNS answers are pinned separately. */
export function isPublicIPv4Address(ip: string): boolean {
  const q = ip.split(".").map(Number);
  if (q.length !== 4 || q.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return false;
  const [a, b, c] = q;
  return a! > 0 && a! < 224 && a !== 10 && a !== 127
    && !(a === 100 && b! >= 64 && b! <= 127)
    && !(a === 169 && b === 254)
    && !(a === 172 && b! >= 16 && b! <= 31)
    && !(a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99))
    && !(a === 198 && (b === 18 || b === 19 || b === 51 && c === 100))
    && !(a === 203 && b === 0 && c === 113);
}
