import { DashLoading } from "@/components/dashboard/xa/DashboardXa";

// Settings-scoped fallback. Renders inside the shell's main area.
export default function SettingsLoading() {
  return <DashLoading label="Loading business details" rows={6} />;
}
