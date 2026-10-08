import type { TenantConfig } from "./types";
import { getTenantDashboardUrl } from "./tenant-urls";
import { workspacePorts } from "./workspace-ports";

/** Owner email and billing navigation. Flags off: exact old URL, no workspace reads. */
export async function ownerNoticeUrl(tenant: TenantConfig, path = "/dashboard", legacyUrl = getTenantDashboardUrl(tenant, path)): Promise<string> {
  if (process.env.STRELVA_WORKSPACE_RELEASE !== "1" || !["1", "workspace"].includes(process.env.STRELVA_OWNER_ENTRY?.trim() ?? "")) return legacyUrl;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const port = await workspacePorts().businessRecord();
    if (!port.ownerNoticeWorkspaceUrl) return legacyUrl;
    return await Promise.race([port.ownerNoticeWorkspaceUrl(tenant, path, legacyUrl), new Promise<string>(resolve => { timer = setTimeout(() => resolve(legacyUrl), 1500); })]);
  } catch { return legacyUrl; }
  finally { if (timer) clearTimeout(timer); }
}
