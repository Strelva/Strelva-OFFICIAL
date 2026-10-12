import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";
import { PhotoLibrary } from "@/components/dashboard/PhotoLibrary";

/** Website > Photos. The library itself is shared with the workspace website (/workspace/site?tab=photos). */
export default async function PhotosPage() {
  // Moved to the workspace website when owner entry is on: the layout redirects a full load; this covers a soft navigation.
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/assets");

  return <PhotoLibrary />;
}
