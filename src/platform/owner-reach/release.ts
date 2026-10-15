/**
 * Owner reach (agency and operator): whether each client's owner can actually
 * be reached, on the agency Clients and Queue views, /admin/queue and the CLI
 * report. Exposure only, on top of `STRELVA_WORKSPACE_RELEASE`. Off (the
 * default): those views are exactly as before. The integrity fixes (staff
 * addresses never receive owner links) are not behind this flag.
 */
export function ownerReachReleaseEnabled(): boolean {
  return process.env.STRELVA_WORKSPACE_RELEASE === "1" && process.env.STRELVA_OWNER_REACH_RELEASE === "1";
}
