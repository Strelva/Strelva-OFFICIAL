"use client";

import { useRouter } from "next/navigation";
import { StNotice } from "@/components/ui/strelva/Kit";
import { BoundedWorkExperience } from "@/experience/operations/BoundedWorkExperience";

/** Preparation uses native scheduling; it does not invent a live visitor page. */
export function BookingAskContinuation({ workspaceId, words }: { workspaceId: string; words: string }) {
  const router = useRouter();
  return <><StNotice>Start by saving availability for your bookings. A visitor booking page also needs a configured service and its inquiry and calendar Connections. Saving availability does not publish a page or book a customer.</StNotice><BoundedWorkExperience workspaceId={workspaceId} productId="scheduling" initialRequest={words} sources={[]} onSaved={id => router.push(`/workspace?${new URLSearchParams({ workspaceId, view: "scheduling", work: id })}`)} /></>;
}
