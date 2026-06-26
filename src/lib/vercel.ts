/**
 * Minimal Vercel REST helpers for the operator onboarding pipeline: create a
 * per-tenant project, set its env vars, and attach a domain. Targets a SPECIFIC
 * project id (the new tenant's), unlike src/lib/domains.ts which operates on the
 * control plane's own project.
 *
 * All calls are null-safe on a missing token (returns an error result, never
 * throws) so the onboarding flow degrades gracefully and reports the gap in its
 * checklist. Uses VERCEL_API_TOKEN (consistent with domains.ts), falling back
 * to VERCEL_TOKEN (what scripts/provision-tenant.ts uses).
 */

const VERCEL_API = "https://api.vercel.com";

function vercelToken(): string | null {
  return process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN || null;
}

function teamQuery(): string {
  return process.env.VERCEL_TEAM_ID
    ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}`
    : "";
}

export function isVercelConfigured(): boolean {
  return Boolean(vercelToken());
}

export type VercelResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function errorMessage(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message || `HTTP ${res.status}`;
}

export async function createVercelProject(
  name: string
): Promise<VercelResult<{ id: string; name: string }>> {
  const token = vercelToken();
  if (!token) return { ok: false, error: "VERCEL_API_TOKEN not set" };
  try {
    const res = await fetch(`${VERCEL_API}/v9/projects${teamQuery()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, framework: "nextjs" }),
    });
    if (!res.ok) return { ok: false, error: await errorMessage(res) };
    const data = (await res.json()) as { id: string; name: string };
    return { ok: true, data: { id: data.id, name: data.name } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed" };
  }
}

/** Set encrypted env vars on a project. Idempotent: an "already exists" key is
 *  treated as success so re-running onboarding doesn't fail. */
export async function setVercelEnv(
  projectId: string,
  vars: Record<string, string>
): Promise<VercelResult<{ set: string[] }>> {
  const token = vercelToken();
  if (!token) return { ok: false, error: "VERCEL_API_TOKEN not set" };
  const set: string[] = [];
  for (const [key, value] of Object.entries(vars)) {
    try {
      const res = await fetch(
        `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env${teamQuery()}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            key,
            value,
            type: "encrypted",
            target: ["production", "preview", "development"],
          }),
        }
      );
      if (res.ok) {
        set.push(key);
        continue;
      }
      const msg = await errorMessage(res);
      if (!/already exists/i.test(msg)) return { ok: false, error: `${key}: ${msg}` };
      set.push(key);
    } catch (err) {
      return { ok: false, error: `${key}: ${err instanceof Error ? err.message : "request failed"}` };
    }
  }
  return { ok: true, data: { set } };
}

/** Delete a project by name or id. Used by the deprovision script to tear down
 *  the `{tenantId}-site` project an onboard created (env vars + domains go with
 *  it). Idempotent: a missing project (404) is treated as success. */
export async function deleteVercelProject(
  nameOrId: string
): Promise<VercelResult<{ deleted: string }>> {
  const token = vercelToken();
  if (!token) return { ok: false, error: "VERCEL_API_TOKEN not set" };
  try {
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${encodeURIComponent(nameOrId)}${teamQuery()}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok || res.status === 404) return { ok: true, data: { deleted: nameOrId } };
    return { ok: false, error: await errorMessage(res) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed" };
  }
}

export async function addVercelDomain(
  projectId: string,
  domain: string
): Promise<VercelResult<{ domain: string }>> {
  const token = vercelToken();
  if (!token) return { ok: false, error: "VERCEL_API_TOKEN not set" };
  try {
    const res = await fetch(
      `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/domains${teamQuery()}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: domain }),
      }
    );
    if (res.ok) return { ok: true, data: { domain } };
    const msg = await errorMessage(res);
    // Already attached → treat as success (idempotent).
    if (/already/i.test(msg)) return { ok: true, data: { domain } };
    return { ok: false, error: msg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed" };
  }
}
