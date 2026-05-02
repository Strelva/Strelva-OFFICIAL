import { ConnectionDetailPage } from "@/components/dashboard/ConnectionDetailPage";

export default async function ConnectionDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConnectionDetailPage connectionId={id} />;
}
