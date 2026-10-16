import { DashLoading } from "@/components/dashboard/xa/DashboardXa";

// The site editor's fallback: the page's own shape, not a three-panel ghost.
export default function ContentLoading() {
  return <DashLoading label="Loading your site" rows={5} />;
}
