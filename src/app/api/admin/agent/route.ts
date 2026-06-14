/**
 * Operator agent — the portfolio-level AI the founders chat with in Mission
 * Control to run the business. Modeled on src/app/api/agent/route.ts (the
 * tool()/streamText pattern and the __TOOL__/__RESULT__ text-stream protocol)
 * but super-admin-gated and portfolio-scoped.
 *
 * SAFETY BY CONSTRUCTION: this route NEVER mutates. Read tools return data;
 * consequential tools (pay link, assign) only return a `requiresConfirmation`
 * proposal carrying the exact params. The Mission Control console renders a
 * confirm card and, on the operator's click, POSTs those params to the existing
 * /api/admin/* endpoints (which gate + audit). The LLM can never commit a
 * mutation on its own.
 */

import { streamText, tool, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { isSuperAdmin } from "@/lib/auth";
import { getPrimaryModel } from "@/lib/ai-models";
import {
  buildPortfolioSnapshot,
  getPortfolioSummary,
  setPortfolioSummary,
  type PortfolioSnapshot,
} from "@/lib/portfolio";
import { buildOpsReport } from "@/lib/ops";
import { getServiceHealth } from "@/lib/health";
import { buildAttentionBriefing } from "@/lib/attention";
import { getAllTenants, getTenantConfig } from "@/lib/tenants";
import { listDrafts, getAllAuditEvents } from "@/lib/storage";
import { listPayLinks } from "@/lib/pay-links";
import { buildRevenueSummary, listBuildPayments } from "@/lib/revenue";

export const maxDuration = 60;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

function isIncomingMessages(value: unknown): value is IncomingMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m &&
        typeof m === "object" &&
        (m as IncomingMessage).role !== undefined &&
        typeof (m as IncomingMessage).content === "string"
    )
  );
}

/** A consequential action the operator must confirm before it commits. */
interface Proposal {
  id: string;
  /** Maps to the existing endpoint the console calls on confirm. */
  action: "mint_pay_link" | "assign_user" | "approve_draft" | "reject_draft" | "update_tenant";
  summary: string;
  params: Record<string, unknown>;
}

/** Trim the snapshot to what the agent needs to reason — keep tokens lean. */
function summarizeSnapshot(s: PortfolioSnapshot) {
  return {
    snapshotAt: s.snapshotAt,
    tenantCount: s.tenantCount,
    mrr: s.mrr,
    launch: {
      ready: s.launchReadyCount,
      watch: s.launchWatchCount,
      blocked: s.launchBlockedCount,
    },
    totalDrafts: s.totalDrafts,
    ops: s.ops.metrics,
    tenants: s.tenants.map((t) => ({
      id: t.id,
      siteName: t.siteName,
      launchStatus: t.launchStatus,
      launchScore: t.launchScore,
      subscriptionStatus: t.subscriptionStatus,
      draftCount: t.draftCount,
      lastActivity: t.lastActivity,
    })),
  };
}

const SYSTEM_PROMPT = `You are the Strelva operator agent — the assistant the founders (Jacob and Noah) use to run their multi-tenant website platform from one place.

You can READ the whole business. Pick the right tool:
- read_attention — the prioritized "what needs attention / what should I work on" briefing (start here for those questions).
- read_portfolio — the overview: tenant count, MRR, launch ready/watch/blocked, per-tenant health.
- read_ops — live operational breakage (failed webhooks, revalidation failures, pending queues, domain drift).
- read_revenue — collected one-time build/managed payments ("how much have we collected").
- read_pay_links — outstanding pay links.
- read_audit — recent operator actions ("what changed / who did X").
- read_tenant — one tenant's config and launch fields.
- list_drafts — AI drafts waiting on review.
- refresh_portfolio — rebuild the cached data when it looks stale (low-risk; runs without confirmation).

For consequential actions — minting a pay link, assigning a user, approving/rejecting a draft, or updating a tenant's config — you do NOT perform them. You call the matching propose_* tool, which returns a confirmation card the operator clicks to commit. Always state plainly what you're proposing and the exact amounts/targets/fields so they can verify before confirming.

Be direct and concise. Lead with the answer. No fluff. When asked "what needs attention" or "what's the health," read the portfolio and surface the blocked tenants, breakage, and pending drafts first. Dollar amounts: pay links are quoted in whole dollars.`;

export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => null)) as { messages?: unknown } | null;
  if (!body || !isIncomingMessages(body.messages)) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages: ModelMessage[] = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const proposals: Proposal[] = [];
  let proposalSeq = 0;
  const nextProposalId = () => `prop_${proposalSeq++}`;

  const tools = {
    read_portfolio: tool({
      description:
        "Read the whole-portfolio snapshot: tenant count, MRR, launch ready/watch/blocked, total drafts, operational metrics, and per-tenant health.",
      inputSchema: z.object({}),
      execute: async () => {
        const snapshot = (await getPortfolioSummary()) ?? (await buildPortfolioSnapshot());
        return summarizeSnapshot(snapshot);
      },
    }),
    read_ops: tool({
      description:
        "Read live operational health: webhook failures, revalidation failures, stale SMS approvals, pending event queues, failed AI writes, and tenant domain drift.",
      inputSchema: z.object({}),
      execute: async () => await buildOpsReport(),
    }),
    read_health: tool({
      description:
        "Check platform dependency health (Redis, Sanity, Clerk, Stripe, Gemini) — overall status + per-service. Use for 'is the platform up / are services healthy'.",
      inputSchema: z.object({}),
      execute: async () => await getServiceHealth(),
    }),
    read_attention: tool({
      description:
        "Read the prioritized 'what needs attention' briefing (launch-blocked tenants, ops breakage, drafts waiting), severity-ranked. Best tool for 'what should I work on' / 'what needs attention'.",
      inputSchema: z.object({}),
      execute: async () => await buildAttentionBriefing(),
    }),
    refresh_portfolio: tool({
      description:
        "Rebuild the portfolio brain from source and warm the cache. Use when the data looks stale or right after a change. Low-risk: only refreshes cached data, never touches a client site.",
      inputSchema: z.object({}),
      execute: async () => {
        const snapshot = await buildPortfolioSnapshot();
        await setPortfolioSummary(snapshot);
        return { refreshed: true, snapshotAt: snapshot.snapshotAt, tenantCount: snapshot.tenantCount };
      },
    }),
    read_tenant: tool({
      description: "Read one tenant's config and key launch fields by tenant id.",
      inputSchema: z.object({ tenantId: z.string() }),
      execute: async ({ tenantId }) => {
        const config = await getTenantConfig(tenantId);
        if (!config) return { error: `No tenant "${tenantId}"` };
        return {
          id: config.id,
          siteName: config.siteName,
          ownerName: config.ownerName,
          ownerEmail: config.ownerEmail,
          active: config.active,
          deliveryModel: config.deliveryModel,
          subscriptionStatus: config.subscriptionStatus,
          productionDomain: config.productionDomain,
          revalidateUrl: config.revalidateUrl,
          hasRevalidationSecret: Boolean(config.revalidationSecret),
        };
      },
    }),
    list_drafts: tool({
      description: "List pending AI drafts across all tenants waiting on review.",
      inputSchema: z.object({}),
      execute: async () => {
        const tenants = await getAllTenants();
        const out: { tenant: string; sections: string[] }[] = [];
        for (const t of tenants) {
          const drafts = await listDrafts(t.id).catch(() => ({} as Record<string, boolean>));
          const sections = Object.keys(drafts);
          if (sections.length) out.push({ tenant: t.id, sections });
        }
        return { tenantsWithDrafts: out, total: out.reduce((n, d) => n + d.sections.length, 0) };
      },
    }),
    read_audit: tool({
      description:
        "Read the recent operator audit trail across the portfolio (tenant changes, assigns, pay links, provisioning). Use to answer 'what changed recently / who did X'.",
      inputSchema: z.object({ limit: z.number().int().positive().max(100).optional() }),
      execute: async ({ limit }) => {
        const events = await getAllAuditEvents(limit ?? 25);
        return {
          events: events.map((e) => ({
            time: e.time,
            action: e.action,
            target: `${e.targetType}:${e.targetId ?? ""}`,
            actor: e.actor.email,
            tenant: e.tenant,
          })),
        };
      },
    }),
    read_pay_links: tool({
      description: "List pay links (slug, client, door, amount) and whether each has been paid.",
      inputSchema: z.object({}),
      execute: async () => {
        const [payLinks, payments] = await Promise.all([
          listPayLinks().catch(() => []),
          listBuildPayments().catch(() => []),
        ]);
        const paid = new Set(payments.map((p) => p.paySlug).filter(Boolean));
        return {
          payLinks: payLinks.map((p) => ({
            slug: p.slug,
            clientName: p.clientName,
            door: p.door,
            amountCents: p.amountCents,
            paid: paid.has(p.slug),
          })),
          count: payLinks.length,
        };
      },
    }),
    read_revenue: tool({
      description:
        "Read collected one-time build/managed payments: total cents, count, and the most recent payments. Use for 'how much have we collected'.",
      inputSchema: z.object({}),
      execute: async () => await buildRevenueSummary(),
    }),
    propose_pay_link: tool({
      description:
        "Propose minting a per-client pay link. Returns a confirmation card; it does NOT create the link. amountDollars is whole dollars.",
      inputSchema: z.object({
        slug: z.string().describe("URL slug, e.g. acme-coffee"),
        clientName: z.string(),
        door: z.enum(["build", "managed_start"]),
        leadSlug: z.string(),
        amountDollars: z.number().positive(),
      }),
      execute: async (p) => {
        const proposal: Proposal = {
          id: nextProposalId(),
          action: "mint_pay_link",
          summary: `Mint a $${p.amountDollars.toLocaleString()} ${p.door} pay link for ${p.clientName} (/pay/${p.slug})`,
          params: {
            slug: p.slug,
            clientName: p.clientName,
            door: p.door,
            leadSlug: p.leadSlug,
            amountCents: Math.round(p.amountDollars * 100),
          },
        };
        proposals.push(proposal);
        return { requiresConfirmation: true, proposalId: proposal.id, summary: proposal.summary };
      },
    }),
    propose_assign_user: tool({
      description:
        "Propose assigning a user (by email) to a tenant with a role. Returns a confirmation card; it does NOT assign.",
      inputSchema: z.object({
        email: z.string().email(),
        tenant: z.string(),
        role: z.enum(["owner", "admin", "editor", "viewer"]).optional(),
      }),
      execute: async (p) => {
        const proposal: Proposal = {
          id: nextProposalId(),
          action: "assign_user",
          summary: `Assign ${p.email} to ${p.tenant} as ${p.role ?? "owner"}`,
          params: { email: p.email, tenant: p.tenant, role: p.role ?? "owner" },
        };
        proposals.push(proposal);
        return { requiresConfirmation: true, proposalId: proposal.id, summary: proposal.summary };
      },
    }),
    propose_approve_draft: tool({
      description:
        "Propose approving a pending AI draft for a tenant section (publishes it live). Returns a confirmation card; does NOT approve.",
      inputSchema: z.object({ tenant: z.string(), section: z.string() }),
      execute: async (p) => {
        const proposal: Proposal = {
          id: nextProposalId(),
          action: "approve_draft",
          summary: `Approve & publish the ${p.section} draft for ${p.tenant}`,
          params: { tenant: p.tenant, section: p.section, action: "approve" },
        };
        proposals.push(proposal);
        return { requiresConfirmation: true, proposalId: proposal.id, summary: proposal.summary };
      },
    }),
    propose_reject_draft: tool({
      description:
        "Propose rejecting a pending AI draft for a tenant section (discards it). Returns a confirmation card; does NOT reject.",
      inputSchema: z.object({ tenant: z.string(), section: z.string() }),
      execute: async (p) => {
        const proposal: Proposal = {
          id: nextProposalId(),
          action: "reject_draft",
          summary: `Reject the ${p.section} draft for ${p.tenant}`,
          params: { tenant: p.tenant, section: p.section, action: "reject" },
        };
        proposals.push(proposal);
        return { requiresConfirmation: true, proposalId: proposal.id, summary: proposal.summary };
      },
    }),
    propose_update_tenant: tool({
      description:
        "Propose a tenant config change (e.g. owner email, subscription status, founder-comp, active). Returns a confirmation card; does NOT apply. Only include the fields to change.",
      inputSchema: z.object({
        tenantId: z.string(),
        ownerEmail: z.string().email().optional(),
        subscriptionStatus: z.enum(["none", "active", "trialing", "past_due", "cancelled"]).optional(),
        planOverride: z.enum(["founder_comp", ""]).optional(),
        active: z.boolean().optional(),
      }),
      execute: async ({ tenantId, ...changes }) => {
        const fields = Object.entries(changes).filter(([, v]) => v !== undefined);
        if (fields.length === 0) {
          return { error: "No fields to change." };
        }
        const proposal: Proposal = {
          id: nextProposalId(),
          action: "update_tenant",
          summary: `Update ${tenantId}: ${fields.map(([k, v]) => `${k}=${v}`).join(", ")}`,
          params: { id: tenantId, ...Object.fromEntries(fields) },
        };
        proposals.push(proposal);
        return { requiresConfirmation: true, proposalId: proposal.id, summary: proposal.summary };
      },
    }),
  };

  const encoder = new TextEncoder();
  const model = getPrimaryModel().model;

  const readable = new ReadableStream({
    async start(controller) {
      let emitted = false;
      try {
        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages,
          tools,
          stopWhen: stepCountIs(8),
        });
        for await (const part of result.fullStream) {
          if (part.type === "error") {
            throw part.error;
          } else if (part.type === "tool-call") {
            const label =
              part.toolName === "read_portfolio" ? "Reading the portfolio..." :
              part.toolName === "read_ops" ? "Checking operational health..." :
              part.toolName === "read_health" ? "Checking platform health..." :
              part.toolName === "read_attention" ? "Building the attention briefing..." :
              part.toolName === "refresh_portfolio" ? "Refreshing the data..." :
              part.toolName === "read_tenant" ? "Looking up the tenant..." :
              part.toolName === "list_drafts" ? "Checking pending drafts..." :
              part.toolName === "read_audit" ? "Reading the audit trail..." :
              part.toolName === "read_pay_links" ? "Checking pay links..." :
              part.toolName === "read_revenue" ? "Tallying collected payments..." :
              part.toolName === "propose_pay_link" ? "Preparing a pay link..." :
              part.toolName === "propose_assign_user" ? "Preparing an access grant..." :
              part.toolName === "propose_approve_draft" ? "Preparing a draft approval..." :
              part.toolName === "propose_reject_draft" ? "Preparing a draft rejection..." :
              part.toolName === "propose_update_tenant" ? "Preparing a tenant change..." :
              "Working on it...";
            controller.enqueue(encoder.encode(`__TOOL__${label}\n`));
          } else if (part.type === "text-delta") {
            const text = "text" in part ? part.text : "";
            if (text) {
              emitted = true;
              controller.enqueue(encoder.encode(text));
            }
          }
        }
      } catch (err) {
        console.error("[operator-agent] turn failed:", err);
        if (!emitted) {
          try {
            controller.enqueue(
              encoder.encode(
                "Sorry — I couldn't reach the AI just now. Please try that again in a moment."
              )
            );
          } catch {}
        }
      } finally {
        try {
          controller.enqueue(
            encoder.encode(`\n__RESULT__${JSON.stringify({ proposals })}\n`)
          );
        } catch {}
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
