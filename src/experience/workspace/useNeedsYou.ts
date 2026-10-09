"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { handledReceiptSchema, ownerDecisionSchema, type Decision, type HandledReceipt, type OwnerDecision } from "@/platform/needs-you/contracts";
import { useWorkspaceRequest } from "./WorkspaceRequest";

const responseSchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
  items: z.array(ownerDecisionSchema),
  complete: z.boolean(),
  handled: z.array(handledReceiptSchema),
  handledAvailable: z.boolean(),
});

export type NeedsYouState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; role: "owner" | "admin" | "member"; items: OwnerDecision[]; complete: boolean; handled: HandledReceipt[]; handledAvailable: boolean };

export type ItemNotice = { tone: "done" | "info" | "error"; text: string };

const DECIDE_COPY: Record<string, ItemNotice> = {
  done: { tone: "done", text: "Done." },
  done_unverified: { tone: "done", text: "Done. Confirmation is still pending." },
  already_handled: { tone: "info", text: "This was already handled." },
  changed: { tone: "info", text: "This changed. Showing the latest." },
  expired: { tone: "info", text: "This lapsed. Nothing changed." },
  failed: { tone: "error", text: "Could not finish this." },
  forbidden: { tone: "error", text: "Only the owner can decide this." },
  not_owner: { tone: "error", text: "Only the owner can decide this." },
  not_found: { tone: "info", text: "This is no longer here." },
  sign_in: { tone: "error", text: "Sign in again to decide this." },
};

/** Needs you and What changed for one business, with Approve / Not yet / Undo. */
export function useNeedsYou(workspaceId: string | undefined) {
  const transport = useWorkspaceRequest();
  const [result, setResult] = useState<{ workspaceId: string; state: NeedsYouState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, ItemNotice>>({});
  const [receiptNotices, setReceiptNotices] = useState<Record<string, ItemNotice>>({});

  useEffect(() => {
    if (!workspaceId) return;
    const abort = new AbortController();
    transport(`/api/workspace/needs-you?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: abort.signal }).then(async response => {
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Your decisions could not be checked. Nothing about them changed.");
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success || parsed.data.items.some(item => item.workspaceId !== workspaceId)) throw new Error("Your decisions could not be confirmed for this business.");
      if (!abort.signal.aborted) setResult({ workspaceId, state: { status: "ready", ...parsed.data } });
    }).catch(cause => {
      if (!abort.signal.aborted) setResult({ workspaceId, state: { status: "error", message: cause instanceof Error ? cause.message : "Your decisions could not be checked." } });
    });
    return () => abort.abort();
  }, [workspaceId, transport, attempt]);

  const refresh = useCallback(() => setAttempt(value => value + 1), []);

  const decide = useCallback(async (item: OwnerDecision, decision: Decision) => {
    if (!workspaceId || pending) return;
    setPending(item.id);
    try {
      const response = await transport("/api/workspace/needs-you", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, itemId: item.id, revision: item.revisionHash, decision }),
      });
      const body = (await response.json().catch(() => null)) as { status?: string } | null;
      const notice = (body?.status && DECIDE_COPY[body.status]) || { tone: "error" as const, text: "That didn't go through. Nothing changed." };
      const text = decision === "not_yet" && notice.tone === "done" ? "Not yet. Nothing changed." : notice.text;
      setNotices(current => ({ ...current, [item.id]: { tone: notice.tone, text: `${item.title}: ${text}` } }));
      refresh();
    } catch {
      setNotices(current => ({ ...current, [item.id]: { tone: "error", text: `${item.title}: that didn't go through. Nothing changed.` } }));
    } finally {
      setPending(null);
    }
  }, [workspaceId, pending, transport, refresh]);

  const undo = useCallback(async (receipt: HandledReceipt) => {
    if (!workspaceId || pending) return;
    setPending(receipt.id);
    try {
      const response = await transport("/api/workspace/needs-you/undo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, receiptId: receipt.id }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setReceiptNotices(current => ({ ...current, [receipt.id]: response.ok ? { tone: "done", text: "Undone." } : { tone: "error", text: body?.error || "That couldn't be undone. Nothing changed." } }));
      refresh();
    } catch {
      setReceiptNotices(current => ({ ...current, [receipt.id]: { tone: "error", text: "That couldn't be undone. Nothing changed." } }));
    } finally {
      setPending(null);
    }
  }, [workspaceId, pending, transport, refresh]);

  const state: NeedsYouState = !workspaceId ? { status: "disabled" } : result?.workspaceId === workspaceId ? result.state : { status: "loading" };
  return { state, refresh, decide, undo, pending, notices, receiptNotices };
}
