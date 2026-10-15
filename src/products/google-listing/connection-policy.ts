import type { GoogleListingClient } from "./client";
export { googleConnectionEligibility, assertGoogleConnectionEligible, assertGoogleBindingEligible, assertTenantGoogleConnectionEligible, assertGoogleGrantEligible } from "@/platform/account-bindings/google-policy";

/** Check every provider call, including token refresh callers separately and
 * definitive-failure retries. Receipt reads remain local and available. */
export function guardGoogleClient(client: GoogleListingClient, check: () => Promise<void>): GoogleListingClient {
  return new Proxy(client, { get(target, property, receiver) {
    const value: unknown = Reflect.get(target, property, receiver);
    if (typeof value !== "function") return value;
    if (property === "withWriteAuthority") return (authorize: () => Promise<void>) => guardGoogleClient(target.withWriteAuthority!(authorize), check);
    return async (...args: unknown[]) => { await check(); return Reflect.apply(value, target, args); };
  } });
}

