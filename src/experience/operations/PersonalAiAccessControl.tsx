"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { AgentAccessScope } from "@/platform/agent-access/types";

type Integration = {
  id: string;
  workId: string;
  grantId: string;
  tokenPrefix: string;
  agentLabel: string;
  scopes: AgentAccessScope[];
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  authority: "issuing_user";
};

type IssueResponse = { token: string; integration: Integration };
type RevokeResponse = { integration: Pick<Integration, "id" | "workId" | "grantId" | "agentLabel" | "authority" | "revokedAt"> };

type Props = {
  workId: string;
  canManage: boolean;
  participationRevision: number | null;
  hasContributions: boolean;
  onAuthorityChanged: () => void;
};

const control = "mt-1 block w-full rounded-md border border-gray-border bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const DAY_MS = 86_400_000;

function isCurrent(integration: Integration, now = Date.now()) {
  return !integration.revokedAt && Date.parse(integration.expiresAt) > now;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function responseBody<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || fallback);
  if (body === null) throw new Error(fallback);
  return body;
}

/** A personal token only opens this work to an AI or script the signed-in owner controls. */
export function PersonalAiAccessControl({ workId, canManage, participationRevision, hasContributions, onAuthorityChanged }: Props) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [waitingForRevision, setWaitingForRevision] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const loadSequence = useRef(0);
  const operationSequence = useRef(0);
  const tokenHeadingRef = useRef<HTMLHeadingElement>(null);
  const scopeHelpId = useId();
  const budgetHelpId = useId();
  const [origin, setOrigin] = useState("");
  const endpoint = `${origin}/api/agent-access/work/${workId}`;

  useEffect(() => {
    const sequence = ++loadSequence.current;
    const controller = new AbortController();
    operationSequence.current += 1;
    setIssuedToken(null);
    setCopyState("idle");
    setWaitingForRevision(null);
    setError("");
    setNotice("");
    setIntegrations([]);
    setBusy(false);
    setLoading(false);
    setLoaded(false);
    setOrigin(window.location.origin);
    if (!canManage) return () => controller.abort();
    setLoading(true);
    void fetch(`/api/agent-access?workId=${encodeURIComponent(workId)}`, { cache: "no-store", signal: controller.signal })
      .then(response => responseBody<unknown>(response, "AI access could not be loaded."))
      .then(body => {
        if (controller.signal.aborted || loadSequence.current !== sequence) return;
        if (!Array.isArray(body)) throw new Error("AI access returned an invalid response.");
        setIntegrations(body as Integration[]);
        setLoaded(true);
      })
      .catch(cause => {
        if (!controller.signal.aborted && loadSequence.current === sequence) setError(cause instanceof Error ? cause.message : "AI access could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted && loadSequence.current === sequence) setLoading(false);
      });
    return () => {
      controller.abort();
      loadSequence.current += 1;
      operationSequence.current += 1;
    };
  }, [canManage, reload, workId]);

  useEffect(() => {
    if (waitingForRevision !== null && participationRevision !== null && participationRevision !== waitingForRevision) setWaitingForRevision(null);
  }, [participationRevision, waitingForRevision]);

  useEffect(() => {
    if (issuedToken) tokenHeadingRef.current?.focus();
  }, [issuedToken]);

  const activeIntegration = useMemo(() => integrations.find(integration => isCurrent(integration)), [integrations]);
  const controlsDisabled = busy || loading || !loaded || participationRevision === null || waitingForRevision !== null;

  if (!canManage) return null;

  async function issue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controlsDisabled || participationRevision === null || activeIntegration) return;
    const form = new FormData(event.currentTarget);
    const durationDays = Number(form.get("durationDays"));
    const scope = form.get("scope") === "read" ? ["read"] as AgentAccessScope[] : ["read", "propose"] as AgentAccessScope[];
    const budgetMinor = scope.includes("propose") ? Math.round(Number(form.get("budget") || 0) * 100) : 0;
    if (![1, 7, 30].includes(durationDays) || !Number.isInteger(budgetMinor) || budgetMinor < 0 || budgetMinor > 100_000_000) {
      setError("Choose a valid expiry and a reported-cost limit from $0 to $1,000,000.");
      return;
    }
    const sequence = ++operationSequence.current;
    const submittedWorkId = workId;
    setBusy(true);
    setError("");
    setNotice("");
    setCopyState("idle");
    try {
      const result = await responseBody<IssueResponse>(await fetch("/api/agent-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "issue",
          workId,
          expectedRevision: participationRevision,
          agentLabel: form.get("agentLabel"),
          purpose: form.get("purpose"),
          scopes: scope,
          expiresAt: new Date(Date.now() + durationDays * DAY_MS).toISOString(),
          budgetMinor,
          currency: "USD",
        }),
      }), "AI access could not be created.");
      if (operationSequence.current !== sequence || submittedWorkId !== workId) return;
      setIntegrations(current => [result.integration, ...current]);
      setIssuedToken(result.token);
      setWaitingForRevision(participationRevision);
      setNotice("Access created for this work. Copy the token now.");
      onAuthorityChanged();
    } catch (cause) {
      if (operationSequence.current === sequence && submittedWorkId === workId) setError(cause instanceof Error ? cause.message : "AI access could not be created.");
    } finally {
      if (operationSequence.current === sequence && submittedWorkId === workId) setBusy(false);
    }
  }

  async function revoke(integration: Integration) {
    if (controlsDisabled || participationRevision === null || !isCurrent(integration)) return;
    const sequence = ++operationSequence.current;
    const submittedWorkId = workId;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await responseBody<RevokeResponse>(await fetch("/api/agent-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "revoke", workId, expectedRevision: participationRevision, tokenId: integration.id }),
      }), "AI access could not be revoked.");
      if (operationSequence.current !== sequence || submittedWorkId !== workId) return;
      setIntegrations(current => current.map(item => item.id === result.integration.id ? { ...item, revokedAt: result.integration.revokedAt } : item));
      setIssuedToken(null);
      setWaitingForRevision(participationRevision);
      setNotice("AI access revoked. That token can no longer open this work.");
      onAuthorityChanged();
    } catch (cause) {
      if (operationSequence.current === sequence && submittedWorkId === workId) setError(cause instanceof Error ? cause.message : "AI access could not be revoked.");
    } finally {
      if (operationSequence.current === sequence && submittedWorkId === workId) setBusy(false);
    }
  }

  async function copyToken() {
    if (!issuedToken) return;
    const sequence = operationSequence.current;
    const copiedWorkId = workId;
    const copiedToken = issuedToken;
    try {
      await navigator.clipboard.writeText(copiedToken);
      if (operationSequence.current !== sequence || workId !== copiedWorkId || issuedToken !== copiedToken) return;
      setCopyState("copied");
    } catch {
      if (operationSequence.current !== sequence || workId !== copiedWorkId || issuedToken !== copiedToken) return;
      setCopyState("failed");
    }
  }

  return <section aria-labelledby="personal-ai-access-heading" className="space-y-3 border-t border-gray-border pt-5">
    <div>
      <h3 id="personal-ai-access-heading" className="font-medium">Use this work from your own AI</h3>
      <p className="mt-1 text-xs leading-relaxed text-gray-muted">Create temporary access for an AI or script you control. It can only read this work and, if allowed, return a proposal for your review. Strelva does not connect or run the outside AI.</p>
    </div>

    {error ? <p role="alert" className="text-critical">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {waitingForRevision !== null ? <p role="status" className="text-xs text-gray-muted">Refreshing this work’s access before another change…</p> : null}

    {issuedToken ? <section aria-labelledby="new-ai-token-heading" className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
      <div>
        <h4 ref={tokenHeadingRef} tabIndex={-1} id="new-ai-token-heading" className="font-medium focus:outline-none">Copy this token now</h4>
        <p className="mt-1 text-xs text-gray-muted">It is shown once and is not stored in readable form. Closing this panel or opening other work clears it from this page.</p>
      </div>
      <code className="block select-all break-all rounded-md border border-gray-border bg-surface-inset p-3 text-xs" data-testid="issued-agent-token">{issuedToken}</code>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void copyToken()}>{copyState === "copied" ? "Token copied" : "Copy token"}</Button>
        <Button type="button" variant="ghost" onClick={() => { setIssuedToken(null); setCopyState("idle"); }}>I saved it</Button>
      </div>
      {copyState === "copied" ? <p role="status" className="text-xs text-positive">Token copied.</p> : null}
      {copyState === "failed" ? <p role="alert" className="text-xs text-critical">Copy failed. Select the token above and copy it manually.</p> : null}
      <dl className="grid gap-2 text-xs sm:grid-cols-[8rem_1fr]">
        <dt className="text-gray-muted">Exact endpoint</dt><dd><code className="break-all">{endpoint}</code></dd>
        <dt className="text-gray-muted">Authentication</dt><dd>Bearer token in the Authorization header</dd>
      </dl>
    </section> : null}

    {loading ? <p role="status" className="text-gray-muted">Loading personal AI access…</p> : null}
    {!loading && !loaded ? <Button type="button" variant="secondary" disabled={busy} onClick={() => setReload(value => value + 1)}>Reload personal AI access</Button> : null}
    {!loading && loaded && !integrations.length ? <p className="text-gray-muted">No personal AI access has been created for this work.</p> : null}
    {integrations.length ? <ul className="divide-y divide-gray-border" aria-label="Personal AI access for this work">
      {integrations.map(integration => {
        const active = isCurrent(integration);
        const status = integration.revokedAt ? "Revoked" : active ? "Active" : "Expired";
        return <li key={integration.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="break-words font-medium">{integration.agentLabel}</p>
            <p className="mt-1 text-xs text-gray-muted">{status} · {integration.scopes.includes("propose") ? "Read and propose" : "Read only"} · Expires {formatDate(integration.expiresAt)}</p>
            <p className="mt-1 text-xs text-gray-muted">Token starts with <code>{integration.tokenPrefix}</code></p>
          </div>
          {active ? <Button type="button" variant="danger" disabled={controlsDisabled} onClick={() => void revoke(integration)}>Revoke</Button> : null}
        </li>;
      })}
    </ul> : null}

    {!activeIntegration && participationRevision !== null ? <details>
      <summary className="cursor-pointer">Create personal AI access</summary>
      <form className="mt-3 space-y-3" onSubmit={issue}>
        <TextInput label="AI or tool name" name="agentLabel" maxLength={120} placeholder="My research assistant" required disabled={controlsDisabled} />
        <TextInput label="What should it help with?" name="purpose" maxLength={1000} required disabled={controlsDisabled} />
        <label className="block">Access scope
          <select name="scope" defaultValue="read_propose" className={control} aria-describedby={scopeHelpId} disabled={controlsDisabled}>
            <option value="read_propose">Read this work and propose changes</option>
            <option value="read">Read this work only</option>
          </select>
        </label>
        <p id={scopeHelpId} className="text-xs text-gray-muted">A proposal stays pending. It cannot publish, spend, contact people, or change the original work.</p>
        <label className="block">Expires after
          <select name="durationDays" defaultValue="7" className={control} disabled={controlsDisabled}>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <TextInput label="Maximum reported proposal cost, USD" name="budget" type="number" min={0} max={1000000} step="0.01" defaultValue="0" required aria-describedby={budgetHelpId} disabled={controlsDisabled} />
        <p id={budgetHelpId} className="text-xs text-gray-muted">$0 allows only proposals that report no cost. This cap does not authorize payment or external spending.</p>
        <Button type="submit" variant="secondary" disabled={controlsDisabled}>Create access token</Button>
      </form>
    </details> : activeIntegration ? <p className="text-xs text-gray-muted">Revoke the current token before creating another one for this work.</p> : null}

    <div className="space-y-1 text-xs text-gray-muted">
      <p>Give the token and exact endpoint only to an AI tool you control. Use GET to read this work. POST proposals use the revision returned by GET and remain inside this work’s normal review path.</p>
      <p>{hasContributions ? <a className="underline underline-offset-4" href="#work-contributions">Review proposals in Contributions below.</a> : "New proposals will appear in Contributions below for review."}</p>
    </div>
  </section>;
}

export { isCurrent as isCurrentPersonalAiAccess };
