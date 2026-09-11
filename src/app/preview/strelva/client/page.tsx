import { notFound } from "next/navigation";
import { DeliveryExperience } from "@/experience/delivery/DeliveryExperience";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your business · Strelva interface preview",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  return <DeliveryExperience audience="client" scenario={state} />;
}
