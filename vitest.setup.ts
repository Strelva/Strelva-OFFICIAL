// Global test environment setup.
//
// Email sending is ON by default in tests so the many send-path tests exercise
// real send behavior. The PRODUCTION default is OFF (paused via
// EMAIL_SENDING_ENABLED, see src/lib/email-enabled.ts) during the domain
// cutover / test-tenant phase; tests that specifically verify the paused
// behavior override this locally.
process.env.EMAIL_SENDING_ENABLED = "true";
