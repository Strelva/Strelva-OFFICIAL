"use client";
import { useState } from "react";
import { WorkspaceGoogle } from "@/experience/places/WorkspaceGoogle";
import { PUBLISHING_LISTING_PREVIEW, PUBLISHING_REVIEW_SITE } from "./publishing-fixture";

/** All commands terminate in memory here. The production form/action is unchanged. */
export function PublishingGooglePreview({ state }: { state: string }) {
  const [result, setResult] = useState("");
  return <WorkspaceGoogle workspaceId="5e000000-0000-4000-8000-000000000010" listingPreview={PUBLISHING_LISTING_PREVIEW} result={result}
    action={async form => { setResult(`Preview: ${String(form.get("action"))} recorded locally. Nothing changed on Google.`); }}
    reviewRequest={async (_url, options) => { const command = JSON.parse(String(options?.body)); return Response.json({ published: false, review: { reply: command.reply } }); }}
    reviews={{ kind: "ready", data: [PUBLISHING_REVIEW_SITE] }}
    state={state === "loading" ? { kind: "loading" } : state === "permission" ? { kind: "permission" } : state === "error" ? { kind: "error" } : { kind: "ready", data: state === "empty" ? [] : [{ tenantId: "juniper", locationId: "fictional-location", name: "The Mooney Firm", control: { workspaceId: "5e000000-0000-4000-8000-000000000010", locationId: "fictional-location", paused: state === "paused", accessPending: state === "pending", updatedAt: null }, canManage: state !== "read_only", connected: state !== "disconnected", drafts: [], receipts: [] }] }} />;
}
