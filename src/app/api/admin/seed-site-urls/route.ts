import { NextResponse } from "next/server";
import { updateTenant } from "@/lib/tenants";

const SITE_URLS: Record<string, string> = {
  rohlax: "https://rohlax-wellness.vercel.app",
  gldf: "https://greatlakesdriedfruit.com",
};

export async function POST(req: Request) {
  const secret = req.headers.get("x-seed-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: Record<string, string> = {};
  for (const [id, siteUrl] of Object.entries(SITE_URLS)) {
    const updated = await updateTenant(id, { siteUrl });
    results[id] = updated ? "updated" : "not found";
  }

  return NextResponse.json({ results });
}
