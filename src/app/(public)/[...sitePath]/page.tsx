import { notFound } from "next/navigation";
import { hostedPageMetadata, renderHostedPage } from "@/products/websites/index";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ sitePath: string[] }> };
export async function generateMetadata({ params }: Props) {
  const { sitePath } = await params;
  return await hostedPageMetadata(`/${sitePath.join("/")}`) ?? { robots: { index: false, follow: false } };
}
export default async function CatalogPage({ params }: Props) {
  const { sitePath } = await params;
  const page = await renderHostedPage(`/${sitePath.join("/")}`);
  if (!page) notFound();
  return page;
}
