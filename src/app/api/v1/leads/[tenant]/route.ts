/**
 * Strelva v1 public lead-capture beacon.
 *
 * A Strelva-native contact/quote form on a client site POSTs submissions here so
 * the dashboard can show "who reached out" with real names instead of anonymous
 * clicks. Public + cross-origin (client sites live on their own domains); a
 * write-only beacon that never returns tenant data, so a wildcard origin is safe.
 *
 * Part of the public /api/v1/* contract — change only additively or via a v2.
 */
import { NextResponse } from "next/server";
import { getTenantConfig } from "@/lib/tenants";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readOptionalJsonObject } from "@/lib/request-body";
import { isTenantId } from "@/lib/scaffold-contracts";
import { captureLead, recordLead } from "@/lib/leads";
import { scoreLeadSpam } from "@/lib/lead-spam";
import {
  getInquiryRepository,
  inquiryReleaseEnabled,
  projectPublishedInquiry,
  recordInquiryEvidence,
  validateInquiryFields,
} from "@/products/inquiries/server";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function corsJson(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

function readFields(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 30) return null;
  const fields: Record<string, string> = {};
  for (const [key, raw] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) || typeof raw !== "string" || raw.length > 5000) return null;
    fields[key] = raw.trim();
  }
  return fields;
}

function isCapabilitySubmission(body: Record<string, unknown>): boolean {
  return body.source === "inquiry-capability" ||
    Object.hasOwn(body, "capabilityId") ||
    Object.hasOwn(body, "capabilityVersion");
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenant: string }> },
): Promise<NextResponse> {
  const { tenant } = await params;
  if (!isTenantId(tenant)) {
    return corsJson({ error: "Invalid tenant" }, 400);
  }

  try {
    // Tighter ceiling than the analytics beacon — a form submit is a deliberate
    // act, not a per-pageview event. Fail open on a limiter error.
    let limited = false;
    try {
      limited = await isRateLimitedAsync(rateLimitKey(req, `v1-leads:${tenant}`), 20);
    } catch {
      limited = false;
    }
    if (limited) {
      return corsJson({ error: "Too many requests" }, 429);
    }

    const body = await readOptionalJsonObject(req);
    if (!body) {
      return corsJson({ error: "Invalid request body" }, 400);
    }

    const name = str(body.name, 200);
    if (!name && !isCapabilitySubmission(body)) {
      return corsJson({ error: "name is required" }, 400);
    }
    const emailRaw = str(body.email, 320);
    const email = emailRaw && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw : undefined;
    const message = str(body.message, 5000);
    const source = str(body.source, 80);

    // Spam gate: a hidden `website`/`company` honeypot (scaffold form leaves it
    // empty) plus the content-gibberish score. Fake-success on a hit so bots
    // can't adapt; real submissions never trip it.
    const honeypot =
      (typeof body.website === "string" ? body.website.trim() : "") ||
      (typeof body.company === "string" ? body.company.trim() : "");
    const spam = scoreLeadSpam({ businessName: name, description: message, email });
    if (honeypot || spam.isSpam) {
      console.warn("[v1 leads] dropped suspected spam", {
        tenant,
        honeypot: honeypot.length > 0,
        score: spam.score,
        signals: spam.signals,
      });
      return corsJson({ ok: true }, 200);
    }

    const config = await getTenantConfig(tenant);
    if (!config || config.active === false) {
      return corsJson({ error: "Tenant not found" }, 404);
    }

    if (isCapabilitySubmission(body)) {
      if (!inquiryReleaseEnabled()) return corsJson({ error: "Inquiry forms are not enabled." }, 503);
      const capabilityId = str(body.capabilityId, 200);
      const capabilityVersion = body.capabilityVersion;
      const fields = readFields(body.fields);
      if (!capabilityId || !Number.isSafeInteger(capabilityVersion) || Number(capabilityVersion) < 1 || !fields) {
        return corsJson({ error: "Invalid inquiry submission" }, 400);
      }

      const inquiryRepository = getInquiryRepository();
      const businessId = config.stableId ?? tenant;
      const snapshot = await inquiryRepository.getSnapshot(tenant, businessId);
      const capability = snapshot?.state.capabilities.find((item) => item.id === capabilityId && item.businessId === (config.stableId ?? tenant));
      const published = capability ? projectPublishedInquiry(capability) : null;
      if (!published) return corsJson({ error: "Inquiry form unavailable." }, 404);
      if (published.version !== Number(capabilityVersion)) {
        return corsJson({ error: "This form changed. Reload it before sending your request." }, 409);
      }

      // Use the same validator as the engine so the public route enforces the
      // exact published definition, including required fields, email syntax,
      // unknown fields, and select options.
      const validationErrors = capability?.live ? validateInquiryFields(capability.live, fields) : ["Inquiry form unavailable."];
      if (validationErrors.length > 0) return corsJson({ error: validationErrors[0] }, 400);

      const name = str(body.name, 200) || str(fields.name, 200) || str(fields.full_name, 200);
      if (!name) return corsJson({ error: "name is required" }, 400);
      const emailRaw = str(body.email, 320) || str(fields.email, 320);
      const email = emailRaw && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw : undefined;
      const message = str(body.message, 5000) || str(fields.message, 5000) || str(fields.request, 5000);
      let captured: Awaited<ReturnType<typeof captureLead>>;
      try {
        captured = await captureLead(
          tenant,
          {
            name,
            email,
            message,
            source: "inquiry-capability",
            fields,
            capabilityId,
            capabilityVersion: Number(capabilityVersion),
          },
          // Capability routing is delivered by the governed inquiry worker.
          // Opt out of the legacy owner notice for this path only; legacy
          // submissions below retain their existing notification behavior.
          { notifyOwner: false },
        );
      } catch {
        return corsJson({ error: "Inquiry capture is temporarily unavailable." }, 503);
      }
      if (captured.status === "unavailable") return corsJson({ error: "Inquiry capture is temporarily unavailable." }, 503);
      const durableLead = captured.status === "captured" || captured.status === "duplicate" ? captured.lead : undefined;
      if (durableLead) {
        const evidence = await recordInquiryEvidence({
          tenantId: tenant,
          businessId,
          inquiryId: durableLead.id,
          capabilityId,
          expectedCapabilityVersion: Number(capabilityVersion),
          fields,
          receivedAt: durableLead.createdAt,
          repository: inquiryRepository,
        });
        // The lead is already durable at this point. A concurrent capability
        // edit must not ask the visitor to submit it again; reconciliation can
        // record the receipt against the captured version.
        if (evidence.status === "stale") return corsJson({ ok: true, pending: true }, 202);
        if (evidence.status === "rejected") return corsJson({ error: evidence.reason }, 400);
        if (evidence.status === "unavailable") return corsJson({ error: "Inquiry provenance is temporarily unavailable." }, 503);
      }
      if (captured.status === "duplicate") return corsJson({ ok: true, duplicate: true }, 200);
      return corsJson({ ok: true }, 200);
    }

    if (!name) return corsJson({ error: "name is required" }, 400);
    await recordLead(tenant, { name, email, message, source });
    return corsJson({ ok: true }, 200);
  } catch (err) {
    console.error("[v1 leads POST]", tenant, err);
    return corsJson({ error: "Failed" }, 500);
  }
}
