/**
 * Which provider keys Strelva itself must hold before a Connection can work.
 * Pure apart from one console.warn per missing set; it reports env names only,
 * never a value. The list matches what the connect and exchange paths already
 * refuse without. docs/operations/integration-keys.md says where each comes from.
 */
export const KEYED_INTEGRATIONS = [
  "google_business_profile", "google_calendar", "outlook_calendar", "calendly", "highlevel",
  "connected_site", "stripe", "resend", "instagram", "google_sign_in_legacy",
] as const;
export type KeyedIntegration = (typeof KEYED_INTEGRATIONS)[number];

/** One of these env names must be non-empty after trim. */
export type KeyRequirement = { anyOf: readonly string[] };

const one = (name: string): KeyRequirement => ({ anyOf: [name] });
const stateSecret: KeyRequirement = { anyOf: ["OAUTH_STATE_SECRET", "INTERNAL_API_SECRET"] };
const appUrl: KeyRequirement = { anyOf: ["APP_URL", "NEXT_PUBLIC_APP_URL"] };

export const PROVIDER_KEY_REQUIREMENTS: Record<KeyedIntegration, readonly KeyRequirement[]> = {
  google_business_profile: [one("GOOGLE_CLIENT_ID"), one("GOOGLE_CLIENT_SECRET"), one("NEXT_PUBLIC_APP_URL"), one("SECRETS_ENC_KEY")],
  google_calendar: [
    { anyOf: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CLIENT_ID"] },
    { anyOf: ["GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"] },
    stateSecret, appUrl,
  ],
  outlook_calendar: [one("MICROSOFT_CLIENT_ID"), one("MICROSOFT_CLIENT_SECRET"), stateSecret, appUrl],
  calendly: [one("CALENDLY_CLIENT_ID"), one("CALENDLY_CLIENT_SECRET"), one("NEXT_PUBLIC_APP_URL")],
  highlevel: [one("HIGHLEVEL_CLIENT_ID"), one("HIGHLEVEL_CLIENT_SECRET"), one("SECRETS_ENC_KEY"), stateSecret, appUrl],
  connected_site: [],
  stripe: [one("STRIPE_SECRET_KEY")],
  resend: [one("RESEND_API_KEY")],
  instagram: [one("INSTAGRAM_CLIENT_ID"), one("INSTAGRAM_CLIENT_SECRET"), one("NEXT_PUBLIC_APP_URL")],
  google_sign_in_legacy: [one("GOOGLE_CLIENT_ID"), one("GOOGLE_CLIENT_SECRET"), one("NEXT_PUBLIC_APP_URL")],
};

export type ProviderKeyStatus = { ready: true } | { ready: false; missing: string[] };

type Env = Record<string, string | undefined>;

/** Pure: names what is missing, never logs, never returns a value. */
export function readProviderKeys(integration: KeyedIntegration, env: Env = process.env): ProviderKeyStatus {
  const missing = PROVIDER_KEY_REQUIREMENTS[integration]
    .filter(requirement => !requirement.anyOf.some(name => (env[name] ?? "").trim() !== ""))
    .map(requirement => requirement.anyOf.join(" or "));
  return missing.length === 0 ? { ready: true } : { ready: false, missing };
}

const warned = new Set<string>();

/** Logs a missing set once per process: names only, never a value. */
export function warnMissingProviderKeysOnce(
  integration: KeyedIntegration,
  missing: readonly string[],
  log: (message: string) => void = console.warn,
): void {
  const key = `${integration}|${missing.join(",")}`;
  if (warned.has(key)) return;
  warned.add(key);
  log(`[connections] ${integration} not set up yet: missing ${missing.join(", ")}`);
}

export function resetProviderKeyWarningsForTests(): void {
  warned.clear();
}

export function providerKeyStatus(
  integration: KeyedIntegration,
  env: Env = process.env,
  log: (message: string) => void = console.warn,
): ProviderKeyStatus {
  const status = readProviderKeys(integration, env);
  if (!status.ready) warnMissingProviderKeysOnce(integration, status.missing, log);
  return status;
}
