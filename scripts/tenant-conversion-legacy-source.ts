/** Operator-only capture of the pre-workspace Redis source.
 * Never a runtime fallback, read-cutover selection or parity qualification. */
import { getRedis } from "../src/platform/infra/redis";
import { DEFAULT_BOOKING_CONFIG } from "../src/lib/booking";
import { normalizeLegacyAccount, type Account } from "../src/lib/accounts";
import type { BookingConfig, DateOverride } from "../src/lib/types";

export type LegacyConversionRedis=Pick<NonNullable<ReturnType<typeof getRedis>>,"get">;
export async function captureLegacyRedisConversionSettings(tenantId:string,redis:LegacyConversionRedis|null=getRedis()):
 Promise<{config:BookingConfig;overrides:DateOverride[];account:Account|null}>{
 if(!redis)throw new Error("Legacy conversion source Redis is not configured.");
 const [rawConfig,rawOverrides,rawAccountId]=await Promise.all([
  redis.get<BookingConfig>("reb:booking:config:"+tenantId),
  redis.get<DateOverride[]>("reb:booking:overrides:"+tenantId),
  redis.get<string>("account-of:"+tenantId),
 ]);
 // Only genuine misses select the existing legacy defaults. Outage/malformed
 // source fails before planning/import; no PG runtime flag or fallback used.
 const config=rawConfig??DEFAULT_BOOKING_CONFIG;
 if(!config||typeof config.timezone!=="string"||!config.timezone.trim())throw new Error("Legacy booking timezone is invalid.");
 try{new Intl.DateTimeFormat("en",{timeZone:config.timezone});}catch{throw new Error("Legacy booking timezone is invalid.");}
 if(rawOverrides!==null&&!Array.isArray(rawOverrides))throw new Error("Legacy booking overrides are invalid.");
 let account:Account|null=null;
 if(rawAccountId!==null){
  if(typeof rawAccountId!=="string"||!rawAccountId)throw new Error("Legacy account reference is invalid.");
  account=normalizeLegacyAccount(await redis.get<unknown>("account:"+rawAccountId));
  if(!account||account.id!==rawAccountId||!account.tenantIds.includes(tenantId))throw new Error("Legacy account source does not match this tenant.");
 }
 return {config,overrides:rawOverrides??[],account};
}
