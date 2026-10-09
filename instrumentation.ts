import { captureRequestError } from "@sentry/nextjs";

/** Next reports nested server-render/request failures through this hook. */
export const onRequestError = captureRequestError;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Plug the workspace layers into the ports src/lib declares (Strelva
    // Reborn section 7) before any request runs.
    await import("./src/register-workspace-ports");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
