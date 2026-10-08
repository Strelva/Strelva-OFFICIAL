import { createHash } from "node:crypto";
import { Writable } from "node:stream";
import { z } from "zod";
import { customArtifactDigest, validateCustomBuild, type CustomBuildInput } from "./build";
import type { CustomApplicationArtifact } from "./contracts";

/** Structural subset of @vercel/sandbox 3.5.1. No package or provider is loaded here. */
export interface VercelSandboxBuildPort {
  create(options: {
    name: string; image: string; region: "iad1"; resources: { vcpus: 1 };
    timeout: 30_000; persistent: false; networkPolicy: "deny-all"; ports: [];
    env: Record<string, string>; signal: AbortSignal;
  }): Promise<{
    name: string; image: string | undefined; persistent: boolean;
    vcpus: number | undefined; memory: number | undefined;
    currentSession(): { sessionId: string };
    writeFiles(files: { path: string; content: Buffer; mode: number }[], options: { signal: AbortSignal }): Promise<unknown>;
    runCommand(options: {
      cmd: string; args: string[]; sudo: true; cwd: string;
      env: Record<string, string>; signal: AbortSignal; stdout: Writable; stderr: Writable;
    }): Promise<{ exitCode: number | null }>;
    readFileToBuffer(file: { path: string }, options: { signal: AbortSignal }): Promise<Buffer | null>;
    stop(options: { signal: AbortSignal }): Promise<unknown>;
  }>;
}

/** Prepared only: the existing Docker/lifecycle artifact still declares 256 MB. */
export type VercelSandboxBuildArtifact = Omit<CustomApplicationArtifact, "limits"> & {
  limits: { network: "none"; memoryMb: 2048; cpuCount: 1; timeoutSeconds: 30 };
};

export class VercelSandboxBuildError extends Error {
  constructor(readonly cleanupRequired: boolean, readonly sandboxName?: string) {
    super(cleanupRequired
      ? "The isolated build requires operator cleanup verification."
      : "The isolated application build failed or exceeded its limits.");
    this.name = "VercelSandboxBuildError";
  }
}

const SOURCE = "/vercel/sandbox/strelva-source";
const MAX_ARTIFACT_BYTES = 512_000;
const MAX_LOG_BYTES = 32_000;
// Trusted control-plane setup. No customer text is interpolated into a command.
// Fail closed if the approved image lacks helpers or permits no tmpfs mounts.
export const SANDBOX_BUILD_SETUP = `set -eu
useradd -M -s /usr/sbin/nologin strelva-builder
mv ${SOURCE} /source
chown -R root:root /source
find /source -type d -exec chmod 555 {} +
find /source -type f -exec chmod 444 {} +
mkdir /output
mount -t tmpfs -o size=2m,noexec,nosuid,nodev,mode=1777 tmpfs /output
mount -t tmpfs -o size=16m,noexec,nosuid,nodev,mode=1777 tmpfs /tmp
test "$(id -u strelva-builder)" -ne 0
test "$(id -Gn strelva-builder)" = strelva-builder
test -z "$(find /source -type l -print -quit)"`;

export const SANDBOX_BUILD_RUN = [
  "--signal=KILL", "25s", "runuser", "-u", "strelva-builder", "--",
  "env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin", "HOME=/tmp",
  "prlimit", "--nproc=64", "--fsize=2097152", "--core=0", "--",
  "node", "--max-old-space-size=192", "/source/build.mjs",
];
// The SDK accumulates command stdout internally even with a Writable sink.
// Keep untrusted logs inside bounded guest tmpfs instead of sending them to it.
export const SANDBOX_BUILD_EXECUTE = `set -eu
timeout ${SANDBOX_BUILD_RUN.join(" ")} >/tmp/strelva-build-stdout 2>/tmp/strelva-build-stderr`;

// Stop every surviving process of the build user before inspecting output.
// The artifact is never derived from an untrusted stdout marker.
export const SANDBOX_BUILD_VERIFY = `set -eu
pkill -KILL -u strelva-builder || test "$?" = 1
test -z "$(pgrep -u strelva-builder || true)"
python3 -c 'import os,stat; p="/output/index.html"; s=os.lstat(p); assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and 0<s.st_size<=512000; assert sum(os.stat(p).st_size for p in ["/tmp/strelva-build-stdout","/tmp/strelva-build-stderr"])<=32000'`;

export interface VercelSandboxBuildConfiguration {
  /** Server-owned approval, default false. A browser flag is not admission. */
  enabled: () => boolean;
  /** Operator-approved VCR image digest with Node and required Linux helpers. */
  image: string;
  /** Recheck exact resource/revision, creator eligibility and accepted spend before create. */
  admit: (input: Readonly<CustomBuildInput>, sourceDigest: string, attemptName: string) => Promise<void>;
  /** Persist SDK observations. Counts do not establish a billable dollar amount. */
  observe?: (event: SandboxBuildObservation) => Promise<void>;
}
export type SandboxBuildObservation = {
  attemptName: string; kind: "created" | "stopped" | "creation_unknown" | "cleanup_failed" | "build_failed";
  sessionId: string | null; payload: { activeCpuDurationMs: number; ingressBytes: number; egressBytes: number } | Record<string, never>;
};
const stoppedUsage = z.object({
  activeCpuDurationMs: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
  networkTransfer: z.object({ ingress: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), egress: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
});

/**
 * Optional internal builder. Deliberately not selected by the lifecycle: provider
 * spend metering, the 2048 MB contract decision, and listed-app qualification
 * must be approved and integrated first. No dependency or spend is authorized
 * by constructing this function. No credentials/source URL/ports enter the VM.
 */
export function createVercelSandboxBuilder(port: VercelSandboxBuildPort, config: VercelSandboxBuildConfiguration) {
  return async (raw: unknown, cancellation?: AbortSignal): Promise<VercelSandboxBuildArtifact> => {
    const input = Object.freeze(validateCustomBuild(raw));
    Object.freeze(input.files);
    const image = config.image;
    if (!config.enabled() || image.length > 256 || !/^[a-zA-Z0-9_./:-]+@sha256:[a-f0-9]{64}$/.test(image)) {
      throw new VercelSandboxBuildError(false);
    }
    const sourceDigest = createHash("sha256").update(JSON.stringify(Object.entries(input.files).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
    // A stable provider-unique name prevents a blind retry from creating a
    // second VM after ambiguous creation. Admission must persist this attempt.
    const sandboxName = `strelva-build-${createHash("sha256").update(JSON.stringify([input.workspaceId, input.resourceId, input.applicationVersion, sourceDigest])).digest("hex").slice(0, 48)}`;
    await config.admit(input, sourceDigest, sandboxName);
    if (!config.enabled()) throw new VercelSandboxBuildError(false);
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000), ...(cancellation ? [cancellation] : [])]);
    signal.throwIfAborted();
    const started = Date.now();
    let sandbox: Awaited<ReturnType<VercelSandboxBuildPort["create"]>> | undefined;
    let creationAttempted = false;
    let sessionId: string | null = null;
    let logBytes = 0;
    const logs = new Writable({ write(chunk, _encoding, done) {
      logBytes += Buffer.byteLength(chunk);
      if (logBytes > MAX_LOG_BYTES) controller.abort();
      // Discard all untrusted output; there is no customer-visible log channel.
      done();
    } });
    try {
      creationAttempted = true;
      sandbox = await port.create({
        name: sandboxName, image, region: "iad1",
        resources: { vcpus: 1 }, timeout: 30_000, persistent: false,
        networkPolicy: "deny-all", ports: [], env: {}, signal,
      });
      if (sandbox.name !== sandboxName || sandbox.image !== image || sandbox.persistent || sandbox.vcpus !== 1 || sandbox.memory !== 2048) throw new Error("Provider configuration mismatch");
      sessionId = sandbox.currentSession().sessionId;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) throw new Error("Invalid provider session");
      await config.observe?.({ attemptName: sandboxName, kind: "created", sessionId, payload: {} });
      await sandbox.writeFiles(Object.entries(input.files).map(([path, content]) => ({ path: `${SOURCE}/${path}`, content: Buffer.from(content), mode: 0o444 })), { signal });
      const run = async (cmd: string, args: string[], cwd: string) => {
        signal.throwIfAborted();
        const result = await sandbox!.runCommand({ cmd, args, cwd, sudo: true, env: {}, signal, stdout: logs, stderr: logs });
        signal.throwIfAborted();
        if (result.exitCode !== 0) throw new Error("Build command failed");
      };
      await run("bash", ["-c", SANDBOX_BUILD_SETUP], "/vercel/sandbox");
      await run("bash", ["-c", SANDBOX_BUILD_EXECUTE], "/source");
      await run("bash", ["-c", SANDBOX_BUILD_VERIFY], "/source");
      const bytes = await sandbox.readFileToBuffer({ path: "/output/index.html" }, { signal });
      signal.throwIfAborted();
      if (!bytes?.length || bytes.length > MAX_ARTIFACT_BYTES) throw new Error("Invalid artifact");
      const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return {
        version: 1, workspaceId: input.workspaceId, resourceId: input.resourceId,
        applicationVersion: input.applicationVersion, sourceDigest,
        artifactDigest: customArtifactDigest({ ...input, html }), image,
        html, builtAt: new Date().toISOString(), durationMs: Date.now() - started,
        state: "built", limits: { network: "none", memoryMb: 2048, cpuCount: 1, timeoutSeconds: 30 },
      };
    } catch {
      // A failed evidence write must not conceal the safe operator lookup or
      // skip cleanup. The started attempt remains held and cannot restart.
      try { await config.observe?.({ attemptName: sandboxName, kind: sandbox ? "build_failed" : "creation_unknown", sessionId, payload: {} }); } catch { /* Durable start remains unresolved. */ }
      throw new VercelSandboxBuildError(creationAttempted && !sandbox, sandboxName);
    } finally {
      logs.destroy();
      if (sandbox) {
        try {
          const result = await sandbox.stop({ signal: AbortSignal.timeout(5_000) });
          if (config.observe) {
            const usage = stoppedUsage.parse(result);
            await config.observe({ attemptName: sandboxName, kind: "stopped", sessionId, payload: { activeCpuDurationMs: usage.activeCpuDurationMs, ingressBytes: usage.networkTransfer.ingress, egressBytes: usage.networkTransfer.egress } });
          }
        } catch {
          try { await config.observe?.({ attemptName: sandboxName, kind: "cleanup_failed", sessionId, payload: {} }); } catch { /* Durable start remains unresolved. */ }
          throw new VercelSandboxBuildError(true, sandbox.name);
        }
      }
    }
  };
}
