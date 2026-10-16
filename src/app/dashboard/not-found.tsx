import { XaButtonLink } from "@/components/ui/strelva/Xa";
import { DashEmpty } from "@/components/dashboard/xa/DashboardXa";

/** Dashboard-context 404: keeps a signed-in owner inside the app, with a way back to Today. */
export default function DashboardNotFound() {
  return (
    <DashEmpty
      pose="alone"
      title="There's no page here."
      job="Everything that needs you is on Home."
      action={<XaButtonLink variant="primary" href="/dashboard">Back to Home</XaButtonLink>}
    >
      It may have moved, or it isn&apos;t part of this website&apos;s dashboard.
    </DashEmpty>
  );
}
