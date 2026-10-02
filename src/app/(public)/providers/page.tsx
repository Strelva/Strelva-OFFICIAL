import { hostedPageMetadata, renderHostedPage } from "@/products/websites/index";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const hosted = await renderHostedPage("/providers");
  if (hosted) return hosted;
  redirect("/about");
}

export async function generateMetadata() {
  return await hostedPageMetadata("/providers") ?? {};
}
