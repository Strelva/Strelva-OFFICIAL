import { notFound } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { ServiceDeliveryQueue, type DeliveryQueueScope } from "@/experience/operations/ServiceDeliveryQueue";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { XaButtonLink, XaEmpty } from "@/components/ui/strelva/Xa";
import { XaObjectPage } from "@/experience/xa-object/XaObjectPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery work", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function DeliveryQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const query = await searchParams;
  const count = [query.businessId, query.providerWorkspaceId, query.providerKind].filter(value => value !== undefined).length;
  if (count !== 1) notFound();
  let scope: DeliveryQueueScope;
  if (query.providerKind === "strelva") return <StrelvaShell title="Delivery work"><XaObjectPage story={<XaEmpty pose="alone" title="This list has moved" job="Every Request and its records are kept in their business." action={<XaButtonLink variant="primary" size="lg" href="/workspace">Open a business or agency</XaButtonLink>}>Requests now live inside the business that asked for them.</XaEmpty>} /></StrelvaShell>;
  else if (query.businessId) { const id = z.string().uuid().safeParse(query.businessId); if (!id.success) notFound(); scope = { businessId: id.data }; }
  else { const id = z.string().uuid().safeParse(query.providerWorkspaceId); if (!id.success) notFound(); scope = { providerWorkspaceId: id.data }; }
  return <StrelvaShell title="Delivery work" workspaceId={"businessId" in scope ? scope.businessId : scope.providerWorkspaceId}><ServiceDeliveryQueue scope={scope} /></StrelvaShell>;
}
