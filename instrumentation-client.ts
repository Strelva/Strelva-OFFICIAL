// Next loads this entry for browser instrumentation, including Turbopack.
// The client config references only NEXT_PUBLIC_SENTRY_DSN and no server secrets.
import "./sentry.client.config";

export { captureRouterTransitionStart as onRouterTransitionStart } from "@sentry/nextjs";
