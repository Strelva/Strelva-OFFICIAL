"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import { useNeedsYou } from "@/experience/workspace/useNeedsYou";
import x from "@/experience/systems/xa/system-xa.module.css";

/**
 * The yes for one booking request, beside the request itself (XA · S2).
 * A request promises a time, so it is the owner's call and is decided through
 * the one Needs you decision (POST /api/workspace/needs-you), never a second
 * write path. Confirm runs the booking's own confirm; Not yet releases the
 * time. If the decision can't be read here, it says where to decide instead.
 */
export function BookingRequestYes({ workspaceId, bookingId, clientName, homeHref }: { workspaceId: string; bookingId: string; clientName: string; homeHref: string }) {
  const router = useRouter();
  const needs = useNeedsYou(workspaceId);
  const [decided, setDecided] = useState<{ id: string; title: string; decision: "approve" | "not_yet" } | null>(null);
  const state = needs.state;
  if (state.status === "loading") return <p className={x.quiet} role="status">Checking {clientName}&apos;s request…</p>;
  const item = state.status === "ready" ? state.items.find(entry => entry.sourceLifecycle === "booking_request" && entry.sourceId === bookingId && entry.state === "open") : undefined;
  const noticeId = item?.id ?? decided?.id;
  const notice = noticeId ? needs.notices[noticeId] : undefined;
  // Needs you prefixes each notice with the decision's title; beside the booking itself, the title is already in view.
  const raw = notice ? notice.text.slice(notice.text.startsWith(`${item?.title ?? decided?.title}: `) ? `${item?.title ?? decided?.title}: `.length : 0) : "";
  // A plain done reads as what changed for this booking, in the owner's words.
  const noticeText = notice?.tone === "done" && decided ? decided.decision === "approve" ? `Confirmed. ${clientName} is booked.` : "Not yet. The time is open again." : raw;
  if (!item) {
    if (decided && notice) return <p className={x.sentence} role={notice.tone === "error" ? "alert" : "status"}>{noticeText}</p>;
    return <p className={x.note}>This request couldn&apos;t be read here. <XaTextLink href={homeHref}>Decide it from Today</XaTextLink></p>;
  }
  const canDecide = state.status === "ready" && (state.role === "owner" || state.canDecide === true || (state.role === "admin" && item.adminMayDecide));
  async function decide(decision: "approve" | "not_yet") {
    if (!item) return;
    setDecided({ id: item.id, title: item.title, decision });
    await needs.decide(item, decision);
    router.refresh();
  }
  return <div className={x.waitsYes}>
    <XaYes state={needs.pending === item.id ? "going" : "waiting"} block={false} shortcut={false}
      yesLabel="Confirm booking" onYes={() => void decide("approve")} onNotYet={canDecide ? () => void decide("not_yet") : undefined}
      working={{ title: decided?.decision === "not_yet" ? "Releasing the time" : "Confirming the booking", steps: [] }}
      disabledReason={canDecide ? undefined : "Only the owner can confirm a booking."} />
    {notice ? <p className={x.sentence} data-tone={notice.tone === "error" ? "waits" : undefined} role={notice.tone === "error" ? "alert" : "status"}>{noticeText}</p> : null}
  </div>;
}
