"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

type Unconfirmed = { workspaceId: string; id: string; kind: "decision" | "undo"; title: string; afterRead: number };

/** Needs you and What changed. Uncertain writes are read back before another write. */
export function useNeedsYou(workspaceId: string | undefined) {
  const transport = useWorkspaceRequest();
  const [result, setResult] = useState<{ workspaceId: string; state: NeedsYouState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, ItemNotice>>({});
  const [receiptNotices, setReceiptNotices] = useState<Record<string, ItemNotice>>({});
  const readSequence = useRef(0);
  const writing = useRef(false);
  const unconfirmed = useRef<Unconfirmed | null>(null);
  const currentWorkspace = useRef(workspaceId);
  useLayoutEffect(() => { currentWorkspace.current = workspaceId; }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const abort = new AbortController();
    const readId = ++readSequence.current;
    transport(`/api/workspace/needs-you?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: abort.signal }).then(async response => {
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Your decisions could not be checked. Check again before deciding.");
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success || parsed.data.items.some(item => item.workspaceId !== workspaceId)) throw new Error("Your decisions could not be confirmed for this business.");
      if (!abort.signal.aborted) {
        setResult({ workspaceId, state: { status: "ready", ...parsed.data } });
        const uncertain = unconfirmed.current;
        if (uncertain?.workspaceId === workspaceId && readId > uncertain.afterRead && parsed.data.complete && parsed.data.handledAvailable) {
          const notice: ItemNotice = uncertain.kind === "decision"
            ? { tone: "info", text: `${uncertain.title}: Latest decisions and changes checked. ${parsed.data.items.some(item => item.id === uncertain.id) ? "Review the current decision before trying again." : "This decision is no longer waiting on you. Check What changed for its recorded outcome."}` }
            : parsed.data.handled.find(receipt => receipt.id === uncertain.id)?.undo.state === "undone"
              ? { tone: "done", text: "Undone. Confirmed in the latest changes." }
              : { tone: "info", text: "Latest changes checked. Review the current Undo state before trying again." };
          const set = uncertain.kind === "decision" ? setNotices : setReceiptNotices;
          set(current => ({ ...current, [uncertain.id]: notice }));
          unconfirmed.current = null;
          writing.current = false;
          setPending(null);
        }
      }
    }).catch(cause => {
      if (!abort.signal.aborted) setResult({ workspaceId, state: { status: "error", message: cause instanceof Error ? cause.message : "Your decisions could not be checked." } });
    });
    return () => abort.abort();
  }, [workspaceId, transport, attempt]);

  const refresh = useCallback(() => setAttempt(value => value + 1), []);

  const markUnconfirmed = useCallback((action: Omit<Unconfirmed, "afterRead">) => {
    unconfirmed.current = { ...action, afterRead: readSequence.current };
    const set = action.kind === "decision" ? setNotices : setReceiptNotices;
    set(current => ({ ...current, [action.id]: { tone: "error", text: `${action.title}: Outcome not confirmed. Checking the latest decisions and changes before you can try again.` } }));
    refresh();
  }, [refresh]);

  const decide = useCallback(async (item: OwnerDecision, decision: Decision) => {
    if (!workspaceId || item.workspaceId !== workspaceId || writing.current || unconfirmed.current) return;
    writing.current = true;
    setPending(item.id);
    try {
      const response = await transport("/api/workspace/needs-you", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, itemId: item.id, revision: item.revisionHash, decision }),
      });
      const body = (await response.json().catch(() => null)) as { status?: string } | null;
      const notice = body?.status && Object.hasOwn(DECIDE_COPY, body.status) ? DECIDE_COPY[body.status] : undefined;
      if (!notice || response.status >= 500) throw new Error("Outcome not confirmed");
      if (currentWorkspace.current !== workspaceId) return;
      const text = decision === "not_yet" && notice.tone === "done" ? "Not yet. Nothing changed." : notice.text;
      setNotices(current => ({ ...current, [item.id]: { tone: notice.tone, text: `${item.title}: ${text}` } }));
      refresh();
    } catch {
      markUnconfirmed({ workspaceId, id: item.id, kind: "decision", title: item.title });
    } finally {
      if (!unconfirmed.current) { writing.current = false; setPending(null); }
    }
  }, [workspaceId, transport, refresh, markUnconfirmed]);

  const undo = useCallback(async (receipt: HandledReceipt) => {
    if (!workspaceId || writing.current || unconfirmed.current) return;
    writing.current = true;
    setPending(receipt.id);
    try {
      const response = await transport("/api/workspace/needs-you/undo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, receiptId: receipt.id }),
      });
      const body = (await response.json().catch(() => null)) as { result?: unknown; error?: string } | null;
      if (!body || response.status >= 500 || (response.ok && !body.result)) throw new Error("Outcome not confirmed");
      if (currentWorkspace.current !== workspaceId) return;
      setReceiptNotices(current => ({ ...current, [receipt.id]: response.ok ? { tone: "done", text: "Undone." } : { tone: "error", text: body.error || "Undo was refused. Check the latest changes." } }));
      refresh();
    } catch {
      markUnconfirmed({ workspaceId, id: receipt.id, kind: "undo", title: "Undo" });
    } finally {
      if (!unconfirmed.current) { writing.current = false; setPending(null); }
    }
  }, [workspaceId, transport, refresh, markUnconfirmed]);

  const state: NeedsYouState = !workspaceId ? { status: "disabled" } : result?.workspaceId === workspaceId ? result.state : { status: "loading" };
  return { state, refresh, decide, undo, pending, notices, receiptNotices };
}
