import Link from "next/link";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA entry previews", robots: { index: false, follow: false } };

const SCREENS: readonly (readonly [string, string, readonly string[]])[] = [
  ["sign-in", "Sign in", ["ready", "resume", "code", "link", "failed", "invite", "admin-host", "email-off"]],
  ["account", "Which business", ["ready", "empty"]],
  ["no-access", "No access", ["ready", "agency", "unknown"]],
  ["audit", "Free check", ["ready", "scanning", "done", "partial", "website-failed", "saved", "error", "agency", "agency-done", "attribution-error"]],
  ["check-not-found", "Business check not found", ["ready"]],
  ["access-request", "How do you want to start", ["ready", "carried", "closed"]],
  ["try", "Try a Possibility", ["ready", "form", "follow-up", "unknown", "loading", "error", "expired", "changed"]],
  ["embed", "Agency check embed", ["ready", "scanning", "done"]],
  ["email-code", "Sign-in code email", ["ready"]],
  ["email-claim", "Claim email", ["ready"]],
];

/** Index of the entry lane's previews. Add &mode=dark to any screen. */
export default function XsEntryIndex() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <main data-workspace-theme="linen" style={{ minHeight: "100dvh", padding: "48px 24px", background: "var(--st-canvas)", color: "var(--st-text)", fontFamily: "var(--font-workspace), sans-serif" }}>
    <h1 style={{ margin: "0 0 24px", fontSize: 28, fontWeight: 600 }}>Getting back in, the free check, the claim</h1>
    <ul style={{ display: "flex", flexDirection: "column", gap: 14, margin: 0, padding: 0, listStyle: "none" }}>
      {SCREENS.map(([screen, label, states]) => <li key={screen}><span style={{ fontWeight: 500 }}>{label}</span>{" "}
        <span style={{ color: "var(--st-text-2)" }}>{states.map((state, index) => <span key={state}>{index ? " · " : ""}<Link href={`/preview/strelva/xa/xs-entry/${screen}?state=${state}`}>{state}</Link></span>)}</span></li>)}
    </ul>
  </main>;
}
