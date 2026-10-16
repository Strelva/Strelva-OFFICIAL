import type { ReactNode } from "react";
import { SidePanel } from "./xa/SystemHead";

/** One open contextual section beside the System's own surface (XA side column). */
export function SystemPanel({ id, title, count, intro, children }: { id: string; title: string; count: number; intro: string; children: ReactNode }) {
  return <SidePanel id={id} title={title} count={count} intro={intro}>{children}</SidePanel>;
}
