"use client";
import { useState } from "react";
import { AccessReviewView } from "../AccessReview";
import { accessReviewFixture } from "./access-review-fixture";
import { StNotice, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
export function AccessReviewPreview({ state }: { state: string }) {
  const [review, setReview] = useState(() => accessReviewFixture(state));
  const [notice, setNotice] = useState("");
  if (state === "loading") return <div className="grid gap-4"><StSkeleton label="Loading access review" /><StSkeleton width="65%" /></div>;
  if (state === "error" || state === "permission") return <div className="grid gap-4"><StNotice tone="critical">{state === "permission" ? "This work is unavailable to your account." : "Access review storage is unavailable."}</StNotice>{state === "error" ? <StTextButton onClick={() => setNotice("Retry checked: fictional storage remains unavailable.")}>Retry</StTextButton> : null}<p role="status">{notice}</p></div>;
  return <AccessReviewView review={review} notice={notice} onRevoke={input => { setReview(current => ({ ...current, units: current.units.map(unit => ({ ...unit, entries: unit.entries.filter(entry => entry.id !== input.recordId || entry.kind !== input.kind) })) })); setNotice("Preview access revoked. No live record changed."); }} />;
}
