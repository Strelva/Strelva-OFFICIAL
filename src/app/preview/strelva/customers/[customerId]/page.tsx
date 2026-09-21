import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomersApp } from "@/experience/customers/CustomersApp";
import {
  customerPreviewOrganization,
  customerPreviewScenario,
  customerPreviewState,
} from "@/experience/customers/preview-fixture";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { resolveHomeFinderPreviewHref } from "@/products/home-finder/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Customer · Local interface preview",
  robots: { index: false, follow: false },
};

export default async function CustomerPreviewPage({ params, searchParams }: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ scenario?: string; resourceId?: string }>;
}) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const [{ customerId }, { scenario: rawScenario, resourceId }] = await Promise.all([params, searchParams]);
  const scenario = customerPreviewScenario(rawScenario);
  const state = customerPreviewState(scenario, "", customerId);
  const known = state.collection.customers.some((customer) => customer.id === customerId);
  return <CustomersApp
    key={`customer:${scenario}:${customerId}:${resourceId || ""}`}
    collection={state.collection}
    detail={known ? state.detail : undefined}
    organizationName={customerPreviewOrganization(scenario)}
    scenario={scenario}
    requestedCustomerId={customerId}
    initialResourceId={resourceId}
    previewHref={resolveHomeFinderPreviewHref({}, "development")}
    preview
  />;
}
