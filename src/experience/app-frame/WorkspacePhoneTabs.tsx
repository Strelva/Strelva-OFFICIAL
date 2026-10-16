import Link from "next/link";
import { PLACE_LABELS } from "@/platform/presentation/place-labels";
import { workspaceSectionHref, type StrelvaSection } from "./workspace-places";

/** The same places and release gate as the desktop navigation. */
export function WorkspacePhoneTabs({ className, systemsReleased = false, appBase = "", workspaceId, active, systemHref }: { className?: string; systemsReleased?: boolean; appBase?: string; workspaceId?: string; active?: StrelvaSection; systemHref?: string }) {
  const href = (section: StrelvaSection) => workspaceSectionHref(section, appBase, workspaceId);
  return <nav className={className} aria-label="Places">
    <Link href={href("home")} aria-current={active === "home" ? "page" : undefined}>{PLACE_LABELS.home}</Link>
    <Link href={href("requests")} aria-current={active === "requests" ? "page" : undefined}>{PLACE_LABELS.requests}</Link>
    <Link href={href("ask")} aria-current={active === "ask" ? "page" : undefined}>{PLACE_LABELS.ask}</Link>
    {systemsReleased ? <Link href={systemHref || href("apps")} aria-current={active === "system" || active === "apps" ? "page" : undefined}>{PLACE_LABELS.systems}</Link> : null}
  </nav>;
}
