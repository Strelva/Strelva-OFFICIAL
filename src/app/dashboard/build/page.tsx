import { requireDashboardView } from "@/lib/dashboard-auth";
import { BlockEditor } from "@/components/dashboard/BlockEditor";

/** Website > Build — the block-based page editor. Auth via requireDashboardView;
 *  the editor is a client component that loads/saves the page config itself. */
export default async function BuildPage() {
  await requireDashboardView();
  return <BlockEditor />;
}
