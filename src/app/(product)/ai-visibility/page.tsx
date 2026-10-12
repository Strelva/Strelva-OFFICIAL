import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { businessCheckHref } from "@/products/website-audit/client";

export const metadata: Metadata = {
  title: "Website and business check",
  description: "Check website health and whether Gemini names your business. Free, no signup required.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(businessCheckHref(await searchParams));
}
