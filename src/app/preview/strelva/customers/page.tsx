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
  title: "Customers · Local interface preview",
  robots: { index: false, follow: false },
};

export default async function CustomersPreviewPage({ searchParams }: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { scenario: rawScenario } = await searchParams;
  const scenario = customerPreviewScenario(rawScenario);
  const state = customerPreviewState(scenario);
  return <CustomersApp
    key={`customers:${scenario}`}
    collection={state.collection}
    organizationName={customerPreviewOrganization(scenario)}
    scenario={scenario}
    previewHref={resolveHomeFinderPreviewHref({}, "development")}
    preview
  />;
}
