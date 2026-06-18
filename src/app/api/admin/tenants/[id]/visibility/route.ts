import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { getLatestSnapshots, diffSnapshots } from "@/lib/visibility/snapshots";
import { diagnoseVisibility, summarizeVisibility } from "@/lib/visibility/diagnose";
import { executeAgentPrompt } from "@/lib/agent-executor";
import { sanitizePromptValue } from "@/lib/capabilities";

/**
 * GET  — the operator's visibility view: latest summary, findings, and the
 *        week-over-week diff (the "prove" signal).
 * POST  — draft a fix for one finding: runs the tenant agent to propose an
 *        on-site change addressing the query. The change goes through the normal
 *        governance path (review queue) — operator-triggered, human-approved.
 * Both super-admin only and audit-logged.
 */

async function loadVisibility(id: string) {
  const snapshots = await getLatestSnapshots(id, 2).catch(() => []);
  const latest = snapshots[0] ?? null;
  if (!latest) return { hasData: false as const };
  return {
    hasData: true as const,
    summary: summarizeVisibility(latest),
    findings: diagnoseVisibility(latest),
    diff: diffSnapshots(snapshots[1] ?? null, latest),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  return NextResponse.json(await loadVisibility(id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const query = body && typeof body === "object" ? (body as { query?: unknown }).query : null;
  // Sanitize before it goes anywhere near the LLM prompt — strips CR/LF/control
  // chars + caps length so the query can't inject a fake instruction line.
  const cleanQuery = sanitizePromptValue(query);
  if (!cleanQuery) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  // Run the tenant agent to draft an on-site improvement. Content changes route
  // through governance to the review queue, so this proposes — it never goes live
  // without an approval.
  const prompt = `A visibility check found this site is not showing up when people search "${cleanQuery}". Draft an on-site improvement that directly and factually answers "${cleanQuery}" so search engines and AI assistants can cite it. Read the most relevant section first (usually FAQ, services, or hero), then add or update content using the business's real information. Keep all existing content. Make the change as a draft for review.`;

  let agentReply: string;
  try {
    agentReply = await executeAgentPrompt(id, prompt);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent failed to draft a fix" },
      { status: 502 }
    );
  }

  await logAuditEvent({
    tenant: id,
    action: "visibility.draft_fix",
    targetType: "tenant",
    targetId: id,
    actor: await getActorContext(id),
    metadata: { query: cleanQuery },
  }).catch(() => {});

  return NextResponse.json({ ok: true, query: cleanQuery, message: agentReply });
}
