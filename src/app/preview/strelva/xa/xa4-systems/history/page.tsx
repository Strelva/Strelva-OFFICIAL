import { xa4PreviewPage } from "@/experience/workspace/preview/xa4-systems-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA-4 · history", robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  return xa4PreviewPage("history", searchParams);
}
