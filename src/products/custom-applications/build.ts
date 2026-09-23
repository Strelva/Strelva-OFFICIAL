import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { customApplicationFilesSchema, type CustomApplicationArtifact } from "./contracts";
export type { CustomApplicationArtifact } from "./contracts";

const exec = promisify(execFile);
const MAX_ARTIFACT_BYTES = 512_000;
const MARKER = "STRELVA_BUILD_OUTPUT:";
/** Pinned installed image. This adapter never pulls an image or installs dependencies. */
export const CUSTOM_BUILD_IMAGE = "node@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584";
const buildSchema = z.object({
  workspaceId: z.string().uuid(), resourceId: z.string().uuid(), applicationVersion: z.number().int().positive(),
  files: customApplicationFilesSchema,
}).strict();
export type CustomBuildInput = z.infer<typeof buildSchema>;
export function validateCustomBuild(input: unknown): CustomBuildInput { return buildSchema.parse(input); }
export function customArtifactDigest(value: { workspaceId: string; resourceId: string; applicationVersion: number; html: string }): string {
  return createHash("sha256").update(JSON.stringify([value.workspaceId, value.resourceId, value.applicationVersion, value.html])).digest("hex");
}

/**
 * Internal construction adapter, not an authorization or publishing entry point.
 * Its caller must admit the build against the owning resource and accepted budget.
 * A successful build proves byte production under these limits, not functional
 * correctness, maintained operation, or permission to release the artifact.
 */
export async function buildCustomApplication(raw: unknown): Promise<CustomApplicationArtifact> {
  const input = validateCustomBuild(raw);
  const folder = await mkdtemp(join(tmpdir(), "strelva-custom-build-"));
  const container = `strelva-build-${randomUUID()}`;
  const started = Date.now();
  try {
    await chmod(folder, 0o755);
    for (const [path, content] of Object.entries(input.files)) {
      const target = join(folder, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, { mode: 0o444 });
    }
    // Nothing in the host environment is passed into the container. Source is
    // read-only; output and temporary storage are bounded in-memory filesystems.
    const script = `import {readFile,lstat} from 'node:fs/promises';
await import('/source/build.mjs');
const stat=await lstat('/output/index.html');
if(!stat.isFile()||stat.size>${MAX_ARTIFACT_BYTES})throw new Error('Invalid output');
const html=await readFile('/output/index.html','utf8');
process.stdout.write('\\n${MARKER}'+JSON.stringify({html})+'\\n');`;
    const { stdout } = await exec("docker", [
      "run", "--rm", "--pull=never", "--name", container,
      "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
      "--pids-limit=64", "--memory=256m", "--memory-swap=256m", "--cpus=1", "--user=1000:1000",
      "--tmpfs=/tmp:rw,noexec,nosuid,size=16m,mode=1777", "--tmpfs=/output:rw,noexec,nosuid,size=2m,mode=1777",
      "--mount", `type=bind,src=${folder},dst=/source,readonly`, "--workdir=/source",
      CUSTOM_BUILD_IMAGE, "node", "--input-type=module", "-e", script,
    ], { timeout: 30_000, maxBuffer: 1_500_000, encoding: "utf8" });
    const output = stdout.split("\n").filter(line => line.startsWith(MARKER)).at(-1);
    if (!output) throw new Error("The isolated build did not produce an application.");
    const result = z.object({ html: z.string().min(1) }).strict().parse(JSON.parse(output.slice(MARKER.length)));
    if (Buffer.byteLength(result.html) > MAX_ARTIFACT_BYTES) throw new Error("The application exceeds the output limit.");
    const sourceDigest = createHash("sha256").update(JSON.stringify(Object.entries(input.files).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
    return {
      version: 1, workspaceId: input.workspaceId, resourceId: input.resourceId, applicationVersion: input.applicationVersion,
      sourceDigest, artifactDigest: customArtifactDigest({ ...input, html: result.html }), image: CUSTOM_BUILD_IMAGE,
      html: result.html, builtAt: new Date().toISOString(), durationMs: Date.now() - started, state: "built",
      limits: { network: "none", memoryMb: 256, cpuCount: 1, timeoutSeconds: 30 },
    };
  } catch {
    // Untrusted stdout/stderr may contain arbitrary text. Do not surface it as
    // application instructions or copy it into customer-visible error output.
    throw new Error("The isolated application build failed or exceeded its limits.");
  } finally {
    await exec("docker", ["rm", "--force", container], { timeout: 5000, maxBuffer: 16_000 }).catch(() => undefined);
    await rm(folder, { recursive: true, force: true });
  }
}
