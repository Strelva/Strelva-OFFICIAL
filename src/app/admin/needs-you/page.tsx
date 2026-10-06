import type { Metadata } from "next";
import { z } from "zod";
import { loadBusinessPolicy } from "./data";
import { PolicyScreen } from "./PolicyView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Who decides",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Strelva's layer of each business's Needs you policy (docs/product/specs/needs-you.md 3.3). */
export default async function WhoDecidesPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const { workspaceId } = await searchParams;
  const parsed = z.string().uuid().safeParse(workspaceId);
  const load = await loadBusinessPolicy(parsed.success ? parsed.data : null);
  return <PolicyScreen load={load} hrefFor={id => `/admin/needs-you?workspaceId=${encodeURIComponent(id)}`} />;
}
