/** Synthetic parity is permitted only for the owned loopback Auth rehearsal. */
export interface ParityRuntime {
  proofMode: string | undefined;
  authUrl: string;
  appUrl: string;
  databaseUrl: string;
  stackDirectory: string;
  stackConfig: string;
}
export function assertOwnedParityRuntime(runtime: ParityRuntime): void {
  const local = (url: URL) => ["127.0.0.1", "localhost"].includes(url.hostname);
  const port = (section: string) => {
    let current = "";
    for (const line of runtime.stackConfig.split("\n")) {
      const header = line.match(/^\[([^\]]+)\]/);
      if (header) current = header[1]!;
      if (current === section) {
        const value = line.match(/^port\s*=\s*(\d+)\s*$/);
        if (value) return value[1];
      }
    }
    return undefined;
  };
  try {
    const auth = new URL(runtime.authUrl), app = new URL(runtime.appUrl), db = new URL(runtime.databaseUrl);
    if (runtime.proofMode !== "1" || !local(auth) || !local(app) || db.hostname !== "127.0.0.1"
      || auth.protocol !== "http:" || app.protocol !== "http:" || auth.search || app.search || db.search || db.hash
      || !["postgres:", "postgresql:"].includes(db.protocol)
      || !/(?:^|\/)strelva-auth\.[A-Za-z0-9]+$/.test(runtime.stackDirectory)
      || !/^project_id\s*=\s*"strelva-proof-[a-f0-9]{16}"\s*$/m.test(runtime.stackConfig)
      || !port("api") || !port("db") || auth.port !== port("api") || db.port !== port("db")) {
      throw new Error("unowned");
    }
  } catch {
    throw new Error("Synthetic parity requires the owned local Auth stack and matching API/database ports.");
  }
}
export interface ParityTenant {
  id: string;
  stableId: string;
  native: null | {
    tenantId: string;
    tenantStableId: string;
    workspaceMatches: boolean;
    actorMatches: boolean;
    verifiedActor: boolean;
    agencyOwner: boolean;
    actorEmail: string;
    agencyName: string;
    agencyKind: string;
    businessName: string;
    businessKind: string;
    sourceKind: string;
    sourceUrl: string;
    productId: string;
    resourceKind: string;
  };
}
/** Native fixture names alone are insufficient: reservation, durable agency
 * addition, actual creator/owner and website work must all be linked. */
export function assertKnownParityTenants(tenants: ParityTenant[]): string[] {
  for (const tenant of tenants) {
    if (tenant.id === "journeys-parity" || /^j10-[a-f0-9]{8}$/.test(tenant.id)) continue;
    const p = tenant.native;
    if (!/^elmwood-bakery-[a-f0-9]{12}$/.test(tenant.id) || !p
      || p.tenantId !== tenant.id || p.tenantStableId !== tenant.stableId
      || !p.workspaceMatches || !p.actorMatches || !p.verifiedActor || !p.agencyOwner
      || !/^local-workflow-agency-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}@example\.test$/.test(p.actorEmail)
      || p.agencyName !== "Northside Web Care" || p.agencyKind !== "agency"
      || p.businessName !== "Elmwood Bakery" || p.businessKind !== "customer"
      || p.sourceKind !== "url" || p.sourceUrl !== "http://elmwood-source.example/"
      || p.productId !== "websites" || p.resourceKind !== "website") {
      throw new Error(`Unexpected tenant in disposable journey parity setup: ${tenant.id}`);
    }
  }
  return tenants.map(tenant => tenant.stableId);
}
