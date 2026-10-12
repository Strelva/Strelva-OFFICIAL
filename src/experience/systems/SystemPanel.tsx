import type { ReactNode } from "react";
import { StMono, StSection } from "@/components/ui/strelva/Kit";

/** One open contextual section for the System's own surface. */
export function SystemPanel({ id, title, count, intro, children }: { id: string; title: string; count: number; intro: string; children: ReactNode }) {
  return <StSection id={id} title={title} meta={count ? <StMono>{count}</StMono> : undefined}>
    <p className="text-sm text-gray-muted">{intro}</p>
    {children}
  </StSection>;
}
