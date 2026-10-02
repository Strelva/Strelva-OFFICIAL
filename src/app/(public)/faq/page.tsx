import { hostedPageMetadata, renderHostedPage } from "@/products/websites/index";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const hosted = await renderHostedPage("/faq");
  if (hosted) return hosted;
  redirect("/");
}

export async function generateMetadata() {
  return await hostedPageMetadata("/faq") ?? {};
}
