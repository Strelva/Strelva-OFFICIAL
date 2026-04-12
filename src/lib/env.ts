/**
 * Environment variable validation.
 *
 * REQUIRED vars throw at import time — the app cannot function without them.
 * OPTIONAL vars warn once on first access and return undefined so features
 * degrade gracefully instead of silently no-oping.
 *
 * Usage (future migration — no existing files changed):
 *   import { CLERK_SECRET_KEY, optional } from "@/lib/env";
 *   // CLERK_SECRET_KEY is a string (guaranteed at import)
 *   // optional.RESEND_API_KEY is string | undefined (warns once if missing)
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable: ${name}. The app cannot start without it.`
    );
  }
  return value;
}

/**
 * Returns a getter that reads the env var lazily and warns exactly once
 * if the value is missing. Subsequent calls return undefined silently.
 */
function optionalEnv(name: string, featureLabel: string): () => string | undefined {
  let checked = false;
  return () => {
    const value = process.env[name];
    if (!value && !checked) {
      checked = true;
      console.warn(
        `[env] ${name} is not set — ${featureLabel} disabled.`
      );
    }
    return value || undefined;
  };
}

// ---------------------------------------------------------------------------
// REQUIRED — fail at import time
// ---------------------------------------------------------------------------

export const NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = requireEnv(
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
);
export const CLERK_SECRET_KEY = requireEnv("CLERK_SECRET_KEY");

// ---------------------------------------------------------------------------
// OPTIONAL — warn once, return undefined
// ---------------------------------------------------------------------------

const _sanityProjectId = optionalEnv(
  "NEXT_PUBLIC_SANITY_PROJECT_ID",
  "Sanity CMS (falling back to file storage)"
);
const _sanityToken = optionalEnv(
  "SANITY_API_TOKEN",
  "Sanity CMS writes (falling back to file storage)"
);
const _stripeSecretKey = optionalEnv(
  "STRIPE_SECRET_KEY",
  "Stripe billing"
);
const _stripeWebhookSecret = optionalEnv(
  "STRIPE_WEBHOOK_SECRET",
  "Stripe webhook verification"
);
const _resendApiKey = optionalEnv(
  "RESEND_API_KEY",
  "email sending (falling back to console)"
);
const _twilioAccountSid = optionalEnv(
  "TWILIO_ACCOUNT_SID",
  "SMS sending"
);
const _twilioAuthToken = optionalEnv(
  "TWILIO_AUTH_TOKEN",
  "SMS sending"
);
const _twilioPhoneNumber = optionalEnv(
  "TWILIO_PHONE_NUMBER",
  "SMS sending"
);
const _googleAiKey = optionalEnv(
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "AI features"
);
const _slackWebhookUrl = optionalEnv(
  "SLACK_WEBHOOK_URL",
  "Slack notifications"
);
const _upstashRedisUrl = optionalEnv(
  "UPSTASH_REDIS_REST_URL",
  "Redis/rate-limiting"
);
const _upstashRedisToken = optionalEnv(
  "UPSTASH_REDIS_REST_TOKEN",
  "Redis/rate-limiting"
);
const _cronSecret = optionalEnv(
  "CRON_SECRET",
  "cron route authentication"
);

/**
 * Optional env vars accessed as `optional.RESEND_API_KEY`.
 * Each getter warns once if missing, then returns undefined silently.
 */
export const optional = {
  get NEXT_PUBLIC_SANITY_PROJECT_ID() { return _sanityProjectId(); },
  get SANITY_API_TOKEN() { return _sanityToken(); },
  get STRIPE_SECRET_KEY() { return _stripeSecretKey(); },
  get STRIPE_WEBHOOK_SECRET() { return _stripeWebhookSecret(); },
  get RESEND_API_KEY() { return _resendApiKey(); },
  get TWILIO_ACCOUNT_SID() { return _twilioAccountSid(); },
  get TWILIO_AUTH_TOKEN() { return _twilioAuthToken(); },
  get TWILIO_PHONE_NUMBER() { return _twilioPhoneNumber(); },
  get GOOGLE_GENERATIVE_AI_API_KEY() { return _googleAiKey(); },
  get SLACK_WEBHOOK_URL() { return _slackWebhookUrl(); },
  get UPSTASH_REDIS_REST_URL() { return _upstashRedisUrl(); },
  get UPSTASH_REDIS_REST_TOKEN() { return _upstashRedisToken(); },
  get CRON_SECRET() { return _cronSecret(); },
} as const;
