import { NextResponse } from "next/server";
import { isSuperAdmin, getCurrentUserEmail, getActorContext } from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import { readJsonObject } from "@/lib/request-body";
import { listBuildPayments } from "@/lib/revenue";
import {
  buildPayLinkConfig,
  savePayLink,
  listPayLinks,
  deletePayLink,
  PayLinkValidationError,
  PayLinkStorageError,
  PayLinkConflictError,
} from "@/lib/pay-links";

/**
 * Super-admin only. Mints a per-client pay link Jacob can send before work
 * starts. Example:
 *   curl -X POST .../api/admin/pay-links -H 'Content-Type: application/json' \
 *     -d '{"slug":"acme-coffee","clientName":"Acme Coffee","door":"build",
 *          "leadSlug":"acme-coffee","amountCents":200000}'
 * Then send the client https://strelva.com/pay/acme-coffee
 *
 * Pass {"overwrite": true} to replace an existing slug; without it, POST refuses
 * to clobber an existing link (409).
 */
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const createdBy = (await getCurrentUserEmail()) || undefined;
  const overwrite = body.overwrite === true;

  let config;
  try {
    config = buildPayLinkConfig({ ...body, createdBy });
  } catch (err) {
    if (err instanceof PayLinkValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  try {
    await savePayLink(config, { overwrite });
  } catch (err) {
    if (err instanceof PayLinkConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof PayLinkStorageError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }

  // Pay links aren't tenant-scoped; key the audit entry on the slug so it's
  // traceable in the global operator feed.
  await logAuditEvent({
    tenant: config.slug,
    action: "paylink.create",
    targetType: "pay_link",
    targetId: config.slug,
    actor: await getActorContext(),
    metadata: {
      clientName: config.clientName,
      door: config.door,
      amountCents: config.amountCents,
      overwrite,
    },
  });

  return NextResponse.json({
    success: true,
    slug: config.slug,
    payUrl: `/pay/${config.slug}`,
    config,
  });
}

/**
 * Super-admin only. Lists every minted pay link (newest first) so Jacob can see
 * what's outstanding — including slug, door, amount(s), createdAt, createdBy.
 */
export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payLinks;
  try {
    payLinks = await listPayLinks();
  } catch (err) {
    if (err instanceof PayLinkStorageError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }

  // Cross-reference the build-payment money trail so the UI can show which links
  // actually converted (a payment whose paySlug matches the link's slug).
  const payments = await listBuildPayments().catch(() => []);
  const paidSlugs = [...new Set(payments.map((p) => p.paySlug).filter((s): s is string => Boolean(s)))];

  return NextResponse.json({ payLinks, count: payLinks.length, paidSlugs });
}

/**
 * Super-admin only. Revoke a pay link by slug: DELETE /api/admin/pay-links?slug=acme.
 * Idempotent — revoking an already-gone slug still returns ok.
 */
export async function DELETE(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // slug may arrive as a query param (UI revoke) or in the JSON body (operator
  // agent commit, which always posts proposal params as a body).
  let slug = new URL(req.url).searchParams.get("slug")?.trim();
  if (!slug) {
    const body = await req.json().catch(() => null);
    if (body && typeof body.slug === "string") slug = body.slug.trim();
  }
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  let removed: boolean;
  try {
    removed = await deletePayLink(slug);
  } catch (err) {
    if (err instanceof PayLinkStorageError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }

  await logAuditEvent({
    tenant: slug,
    action: "paylink.revoke",
    targetType: "pay_link",
    targetId: slug,
    actor: await getActorContext(),
    metadata: { removed },
  });

  return NextResponse.json({ ok: true, removed });
}
