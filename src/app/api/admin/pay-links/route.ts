import { NextResponse } from "next/server";
import { isSuperAdmin, getCurrentUserEmail, getActorContext } from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import { readJsonObject } from "@/lib/request-body";
import {
  buildPayLinkConfig,
  savePayLink,
  listPayLinks,
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

  return NextResponse.json({ payLinks, count: payLinks.length });
}
