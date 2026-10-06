// Global test environment setup.
//
// Email sending is ON by default in tests so the many send-path tests exercise
// real send behavior. The PRODUCTION default is OFF (paused via
// EMAIL_SENDING_ENABLED, see src/platform/infra/email/enabled.ts) during the
// domain cutover / test-tenant phase; tests that specifically verify the
// paused behavior override this locally.
process.env.EMAIL_SENDING_ENABLED = "true";

// The app edge registers the workspace ports src/lib declares, as
// instrumentation.ts does for the Next.js server. The loaders resolve their
// modules at call time, so each test's vi.mock still applies.
import "./src/register-workspace-ports";
