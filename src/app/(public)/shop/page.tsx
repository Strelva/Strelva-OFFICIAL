import { hostedPageMetadata, renderHostedPage } from "@/products/websites/index";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const hosted = await renderHostedPage("/shop");
  if (hosted) return hosted;
  redirect("/");
}

export async function generateMetadata() {
  return await hostedPageMetadata("/shop") ?? {};
}
