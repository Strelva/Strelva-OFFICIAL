import { readTenantBusinessContext } from "./service";

export type TenantBusinessContext = NonNullable<Awaited<ReturnType<typeof readTenantBusinessContext>>>;

/** Added readers are default-off, independently from the existing recipient rule. */
export function businessRecordReadsEnabled(): boolean {
  return process.env.STRELVA_WORKSPACE_RELEASE === "1" && process.env.STRELVA_BUSINESS_RECORD_READS === "1";
}

/** Public read only. Missing migration or an unavailable store retains the issued website. */
export async function readReleasedTenantBusinessContext(tenantId: string): Promise<TenantBusinessContext | null> {
  if (!businessRecordReadsEnabled()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readTenantBusinessContext(tenantId),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1500); }),
    ]);
  } catch { return null; }
  finally { if (timer) clearTimeout(timer); }
}

export function businessAddress(facts: TenantBusinessContext["facts"]): string | undefined {
  const address = facts.address;
  return address?.formatted || (address ? [address.line1, address.line2, address.city, address.region, address.postalCode, address.country].filter(Boolean).join(", ") : undefined);
}
