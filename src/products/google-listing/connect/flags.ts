/**
 * Getting started L4 switches. Each is env-only and off unless exactly "1",
 * so a typo fails closed. Both sit under the existing publishing release and
 * STRELVA_GOOGLE_BINDINGS; neither turns anything on by itself.
 *
 * STRELVA_GOOGLE_OWNER_CONNECT: an owner finds and connects their own listing,
 *   its found facts are read, and an agency holding the Google area can copy a
 *   connect link for the owner.
 * STRELVA_GOOGLE_READ_GRANT: the separate, optional read-only grant for Search
 *   Console and Analytics.
 */
export type ConnectEnv = Record<string, string | undefined>;
export function googleOwnerConnectEnabled(env: ConnectEnv = process.env): boolean { return env.STRELVA_GOOGLE_OWNER_CONNECT === "1"; }
export function googleReadGrantEnabled(env: ConnectEnv = process.env): boolean { return env.STRELVA_GOOGLE_READ_GRANT === "1"; }
