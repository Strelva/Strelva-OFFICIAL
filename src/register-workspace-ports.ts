/**
 * The app edge: plugs the workspace layers into the ports the tenant model
 * declares (src/lib/workspace-ports.ts), once per runtime. Imported for its
 * effect by instrumentation.ts (the Next.js server), vitest.setup.ts and the
 * scripts that reach those modules. Strelva Reborn section 7.
 */
import { registerWorkspacePorts, type WorkspacePorts } from "@/lib/workspace-ports";
import { workspacePortLoaders } from "@/server/workspace-ports";

const ports: WorkspacePorts = workspacePortLoaders;
registerWorkspacePorts(ports);
