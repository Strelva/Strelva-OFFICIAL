import { NextResponse } from "next/server";
import { getAllTenants } from "@/lib/tenants";
import { fetchSearchData } from "@/lib/search-console";
import { setSearchData } from "@/lib/storage";
import { generateSuggestionsForTenant } from "@/lib/suggestions";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active && t.siteUrl);
  const results: { tenant: string; clicks: number; queries: number }[] = [];

  for (const tenant of active) {
    const data = await fetchSearchData(tenant.siteUrl!);
    await setSearchData(tenant.id, data);

    if (data.queries.length > 0) {
      await generateSuggestionsForTenant(tenant.id);
    }

    results.push({
      tenant: tenant.id,
      clicks: data.totalClicks,
      queries: data.queries.length,
    });
  }

  return NextResponse.json({ ok: true, results });
}
