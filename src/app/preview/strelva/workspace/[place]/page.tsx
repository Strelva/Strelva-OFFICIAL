import { notFound, redirect } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";

/**
 * Fixture-only. Workspace screens link to `${appBase}/workspace/<place>`; in the
 * preview appBase is /preview/strelva, so send those links to the matching
 * fixture page (keeping `tab`, `period`, `view`) instead of a 404.
 */
const TARGETS: Record<string, { path: string; place?: string }> = {
  inquiries: { path: "/preview/strelva/places", place: "inquiries" },
  reviews: { path: "/preview/strelva/places", place: "reviews" },
  results: { path: "/preview/strelva/places", place: "results" },
  "business-details": { path: "/preview/strelva/places", place: "business-details" },
  bookings: { path: "/preview/strelva/bookings" },
  recaps: { path: "/preview/strelva/recaps" },
  site: { path: "/preview/strelva/workspace-site" },
};

export default async function WorkspacePlacePreviewAlias({ params, searchParams }: {
  params: Promise<{ place: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { place } = await params;
  const target = TARGETS[place];
  if (!target) notFound();
  const source = await searchParams;
  const query = new URLSearchParams();
  if (target.place) query.set("place", target.place);
  for (const name of ["tab", "period", "view", "state"]) {
    const value = source[name];
    if (typeof value === "string") query.set(name, value);
  }
  const search = query.toString();
  redirect(search ? `${target.path}?${search}` : target.path);
}
