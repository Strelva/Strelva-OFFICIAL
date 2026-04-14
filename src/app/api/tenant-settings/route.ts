import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";
import { getTenantConfig, updateTenant } from "@/lib/tenants";
import type { BusinessHours } from "@/lib/types";

/** Tenant-level settings: businessRules, personality, businessHours */

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const config = await getTenantConfig(tenant);
    if (!config) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    return NextResponse.json({
      businessRules: config.businessRules || "",
      personality: config.personality || "",
      businessHours: config.businessHours || null,
    });
  } catch (err) {
    console.error("[tenant-settings GET]", err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.businessRules === "string") {
      updates.businessRules = body.businessRules.slice(0, 2000);
    }
    if (typeof body.personality === "string") {
      updates.personality = body.personality.slice(0, 500);
    }
    if (body.businessHours !== undefined) {
      if (body.businessHours === null) {
        updates.businessHours = undefined;
      } else {
        const bh = body.businessHours as BusinessHours;
        if (Array.isArray(bh.schedule)) {
          updates.businessHours = {
            schedule: bh.schedule.slice(0, 7).map((d) => ({
              day: Number(d.day),
              open: String(d.open || "09:00"),
              close: String(d.close || "17:00"),
              closed: Boolean(d.closed),
            })),
            holidays: Array.isArray(bh.holidays)
              ? bh.holidays.slice(0, 50).map((h) => ({
                  date: String(h.date),
                  label: String(h.label),
                }))
              : [],
            timezone: typeof bh.timezone === "string" ? bh.timezone : undefined,
          };
        }
      }
    }

    const updated = await updateTenant(tenant, updates);
    if (!updated) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[tenant-settings PUT]", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
