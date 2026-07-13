/**
 * POST /api/content/testimonials/append
 *
 * Atomically appends ONE testimonial. Replaces the old client-side
 * GET-then-PUT-the-whole-section flow (UseAsTestimonialModal), which lost an
 * append when two ran close together. The client now sends only the new item;
 * the server merges it under a per-tenant lock (`src/lib/testimonials.ts`).
 *
 * Gated exactly like the content PUT: tenant access + content:write + active
 * subscription. Body: { quote, author, location }.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { requireTenantPermission, getActorContext } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";
import { appendTestimonial } from "@/lib/testimonials";
import { logActivity } from "@/lib/storage";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { clientRevalidationTargetForSections } from "@/lib/content-revalidation";

export async function POST(req: Request) {
  try {
    const tenant = await requireTenantFromHeaders();
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const actor = await getActorContext(tenant);
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const quote = typeof body.quote === "string" ? body.quote.trim() : "";
    const author = typeof body.author === "string" ? body.author.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    if (!quote || !author) {
      return NextResponse.json({ error: "Quote and author are required" }, { status: 422 });
    }

    const result = await appendTestimonial(
      tenant,
      { quote, author, location },
      actor.isImpersonating ? "admin" : "user",
    );
    if (!result.ok) {
      return NextResponse.json({ error: "Testimonials are being updated — try again" }, { status: 409 });
    }

    await logActivity(
      {
        text: actor.isImpersonating ? "Strelva admin added a testimonial" : "Added a testimonial",
        time: new Date().toISOString(),
        type: "admin",
        section: "testimonials",
        actor: actor.isImpersonating ? "admin" : "user",
      },
      tenant,
    );

    revalidatePath("/");
    revalidateClientSite(tenant, clientRevalidationTargetForSections(["testimonials"])).catch(() => {});

    return NextResponse.json({ success: true, testimonial: result.testimonial });
  } catch (err) {
    console.error("[testimonials append]", err);
    return NextResponse.json({ error: "Failed to add testimonial" }, { status: 500 });
  }
}
