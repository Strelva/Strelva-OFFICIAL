"use client";
import { useState } from "react";
import { AccessReviewView } from "../AccessReview";
import { accessReviewFixture } from "./access-review-fixture";
import { Button } from "@/components/ui/Button";
export function AccessReviewPreview({ state }: { state: string }) {
  const [review, setReview] = useState(() => accessReviewFixture(state));
  const [notice, setNotice] = useState("");
  if (state === "loading") return <p role="status">Loading access review…</p>;
  if (state === "error" || state === "permission") return <div><p role="alert">{state === "permission" ? "This work is unavailable to your account." : "Access review storage is unavailable."}</p><Button className="mt-4" variant="secondary" onClick={() => setNotice("Retry checked: fictional storage remains unavailable.")}>Retry</Button><p role="status">{notice}</p></div>;
  return <AccessReviewView review={review} notice={notice} onRevoke={input => { setReview(current => ({ ...current, units: current.units.map(unit => ({ ...unit, entries: unit.entries.filter(entry => entry.id !== input.recordId || entry.kind !== input.kind) })) })); setNotice("Preview access revoked. No live record changed."); }} />;
}
