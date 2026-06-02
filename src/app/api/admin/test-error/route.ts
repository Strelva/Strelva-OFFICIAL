import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { isSuperAdmin } from "@/lib/auth";
import { setSentryContext } from "@/lib/sentry-context";

/**
 * POST /api/admin/test-error
 *
 * Super-admin only. Fires a test error into Sentry to verify the pipeline.
 * Use to confirm DSN is configured, alerts fire, and context tags appear.
 */
export async function POST() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  setSentryContext({
    tenantId: "test-error",
    userId: "super-admin",
    route: "/api/admin/test-error",
  });

  const testError = new Error("Scaffold Web test error — verify Sentry pipeline");
  Sentry.captureException(testError);

  await Sentry.flush(2000);

  return NextResponse.json({
    ok: true,
    message: "Test error sent to Sentry. Check your Sentry dashboard for an event with tenantId=test-error.",
    sentryConfigured: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
  });
}
