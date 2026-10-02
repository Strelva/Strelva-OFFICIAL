import { hostedPageMetadata, renderHostedPage } from "@/products/websites/index";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const hosted = await renderHostedPage("/services");
  if (hosted) return hosted;
  redirect("/");
}

export async function generateMetadata() {
  return await hostedPageMetadata("/services") ?? {};
}
