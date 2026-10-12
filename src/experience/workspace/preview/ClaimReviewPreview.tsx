"use client";
/** Fictional claim review fixtures. No claim, sign-in, connection or email is performed. */
import { useState } from "react";
import { StNotice } from "@/components/ui/strelva/Kit";
import { OwnerClaimReviewPresentation } from "@/experience/workspace/agency/OwnerClaimAcceptance";
import { initialClaimReviewChoices } from "@/experience/workspace/agency/OwnerClaimReview";
import type { ClaimReview, ClaimReviewAccepted, OwnerClaimPreview } from "@/products/agency-clients/contracts";

const WS = "00000000-0000-4000-8000-000000000031";
const preview: OwnerClaimPreview = { workspaceName: "Elmwood Bakery", agencyName: "North Studio", recipientEmail: "pat@example.invalid", status: "pending", expiresAt: "2026-10-26T12:00:00Z" };
const review: ClaimReview = { status: "pending", workspaceId: WS, workspaceName: "Elmwood Bakery", agencyWorkspaceId: "00000000-0000-4000-8000-0000000000a1", agencyName: "North Studio",
  found: [
    { id: "00000000-0000-4000-8000-0000000000f1", entity: "fact", key: "phone", value: "(716) 555-0100", sourceUrl: "https://elmwood-bakery.example.invalid/contact", quote: "Call us at (716) 555-0100" },
    { id: "00000000-0000-4000-8000-0000000000f2", entity: "fact", key: "address", value: { formatted: "812 Elmwood Ave, Buffalo, NY 14222" }, sourceUrl: "https://elmwood-bakery.example.invalid/contact", quote: "812 Elmwood Ave, Buffalo, NY 14222" },
    { id: "00000000-0000-4000-8000-0000000000f3", entity: "fact", key: "hours", value: { weekly: [1, 2, 3, 4, 5].map(day => ({ day, opens: "07:00", closes: "15:00" })) }, sourceUrl: "https://elmwood-bakery.example.invalid/", quote: "Mo-Fr 07:00-15:00" },
    { id: "00000000-0000-4000-8000-0000000000f4", entity: "fact", key: "description", value: "A neighborhood bakery on Elmwood Avenue, baking bread and custom cakes since 1998.", sourceUrl: "https://elmwood-bakery.example.invalid/", quote: "A neighborhood bakery on Elmwood Avenue" },
    { id: "00000000-0000-4000-8000-0000000000f5", entity: "fact", key: "links", value: [{ kind: "website", url: "https://elmwood-bakery.example.invalid/" }, { kind: "instagram", url: "https://instagram.com/elmwoodbakery" }], sourceUrl: "https://elmwood-bakery.example.invalid/", quote: "Instagram" },
    { id: "00000000-0000-4000-8000-0000000000f6", entity: "service", key: null, value: { name: "Custom cakes" }, sourceUrl: "https://elmwood-bakery.example.invalid/services", quote: "Custom cakes for every occasion" },
    { id: "00000000-0000-4000-8000-0000000000f7", entity: "person", key: null, value: { name: "Pat Baker" }, sourceUrl: "https://elmwood-bakery.example.invalid/about", quote: "Pat Baker, owner and head baker" },
  ],
  prepared: [{ id: "00000000-0000-4000-8000-0000000000b1", name: "Cake order form", kind: "intake" }, { id: "00000000-0000-4000-8000-0000000000b2", name: "Website", kind: "website" }],
  fullControlTaken: [] };

export function ClaimReviewPreview({ state }: { state: string }) {
  const ready = { ...review, ...(state === "empty" ? { found: [], prepared: [] } : {}) };
  const [choices, setChoices] = useState(() => initialClaimReviewChoices(ready, "America/New_York"));
  const [accepted, setAccepted] = useState<ClaimReviewAccepted | null>(state === "done" ? { workspaceId: WS, workspaceName: "Elmwood Bakery", status: "accepted", alreadyAccepted: false } : null);
  const load = state === "loading" ? { kind: "loading" as const } : state === "signed-out" ? { kind: "signed_out" as const }
    : state === "error" ? { kind: "error" as const, message: "This link was made for a different email address. Sign in with the address it was sent to." } : { kind: "ready" as const, review: ready };
  return <><StNotice>Fictional preview · no claim, sign-in, connection or email.</StNotice>
    <OwnerClaimReviewPresentation preview={preview} load={load} choices={choices} accepted={accepted} submitting={false} error="" target="/preview/strelva/claim-review"
      onChange={setChoices} onAccept={() => setAccepted({ workspaceId: WS, workspaceName: "Elmwood Bakery", status: "accepted", alreadyAccepted: false })} navigate={() => undefined} /></>;
}
