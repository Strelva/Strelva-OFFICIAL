import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import type { PlaceState } from "@/platform/owner-entry/place-state";

/**
 * The frame of a workspace place that used to be a `/dashboard` page
 * (owner-entry spec §5): a way back to Home, where it sits, its name, and the
 * same three failure states on every place. Server-rendered, like Recaps.
 */

export type { PlaceState } from "@/platform/owner-entry/place-state";

export function placeHomeHref(workspaceId: string): string {
  return `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
}

export function WorkspacePlace({ workspaceId, eyebrow, title, intro, state, errorTitle, errorBody, denied = [], wide = false, embedded = false, children }: {
  workspaceId: string;
  eyebrow: string;
  title: string;
  intro: string;
  state: PlaceState<unknown>;
  errorTitle: string;
  errorBody: string;
  /** Linked sites this person has no access to; named, never read. */
  denied?: readonly string[];
  wide?: boolean;
  embedded?: boolean;
  children?: ReactNode;
}) {
  const Frame = embedded ? "section" : "main";
  return (
    <Frame className={embedded ? "p-6 text-warm-black" : "min-h-dvh bg-canvas px-4 py-10 text-warm-black sm:px-6 md:px-8 md:py-12 lg:px-12"}>
      <div className={`mx-auto ${wide ? "max-w-[960px]" : "max-w-[760px]"}`}>
        {!embedded ? <a className="text-sm text-gray-muted underline-offset-4 hover:underline focus-visible:underline" href={placeHomeHref(workspaceId)}>Back to Home</a> : null}
        <p className="mt-10 text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">{eyebrow}</p>
        <h1 className="mt-3 font-display text-[34px] font-medium leading-tight sm:text-[40px]">{title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-gray-muted">{intro}</p>

        {state.kind === "permission" ? (
          <Card padding="lg" className="mt-8" role="alert">
            <h2 className="text-lg font-medium">This belongs to another business</h2>
            <p className="mt-2 text-sm leading-6 text-gray-muted">Your account isn&apos;t a member of this business. Ask its owner to invite you, or open your own workspace.</p>
            <Link className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline" href="/workspace">Open your workspace</Link>
          </Card>
        ) : state.kind === "error" ? (
          <Card padding="lg" className="mt-8" role="alert">
            <h2 className="text-lg font-medium">{errorTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-muted">{errorBody}</p>
          </Card>
        ) : (
          <>
            {denied.length ? (
              <Card padding="md" className="mt-6" role="status">
                <p className="text-sm leading-6 text-gray-muted">
                  Your account can&apos;t open {denied.join(", ")} yet, so {denied.length === 1 ? "it isn't" : "they aren't"} shown. Ask the owner to finish adding you.
                </p>
              </Card>
            ) : null}
            {children}
          </>
        )}
      </div>
    </Frame>
  );
}

export function NoSiteCard({ body }: { body: string }) {
  return (
    <Card padding="lg" className="mt-6">
      <h2 className="text-lg font-medium">No site is connected to this business yet</h2>
      <p className="mt-2 text-sm leading-6 text-gray-muted">{body}</p>
    </Card>
  );
}

export function SiteHeading({ id, name, multiple }: { id: string; name: string; multiple: boolean }) {
  return multiple
    ? <h2 id={id} className="mb-3 text-lg font-medium">{name}</h2>
    : <h2 id={id} className="sr-only">{name}</h2>;
}

export function whenLabel(value: string, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }
    : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
