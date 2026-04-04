import { NextResponse } from "next/server";
import { generateSuggestionsForAll } from "@/lib/suggestions";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await generateSuggestionsForAll();
  return NextResponse.json({ ok: true });
}
