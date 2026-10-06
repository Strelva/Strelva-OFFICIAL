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
