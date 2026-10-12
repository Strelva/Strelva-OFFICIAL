/** Public product entry point for the managed-presence compatibility layer. */
export { publicHostname } from "./hostname";
export {
  MANAGED_WEBSITES_LABEL,
  MANAGED_WEBSITES_COPY,
} from "./client";
export {
  resolveLegacyManagedPresence,
  type LegacyManagedPresenceResolution,
  type LegacyManagedPresenceSource,
} from "./legacy";
