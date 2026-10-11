import type { Metadata } from "next";
import { headers } from "next/headers";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { productLearningEnabled } from "@/products/product-learning/server";
import { workspaceHref } from "./workspace-href";
import { InternalWorkView } from "./WorkView";
import { loadBusinessEffort } from "./effort-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Internal work",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function InternalWorkPage() {
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("host") || "";
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const workspaceOpen = workspaceReleaseEnabled();
  const learningOpen = workspaceOpen && productLearningEnabled();
  const operationsHref = workspaceHref(requestHost, forwardedProto, "operations");
  const learningHref = workspaceHref(requestHost, forwardedProto, "product-learning");
  const effort = await loadBusinessEffort();

  return <InternalWorkView effort={effort} workspaceOpen={workspaceOpen} learningOpen={learningOpen} operationsHref={operationsHref} learningHref={learningHref} />;
}
