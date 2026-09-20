"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/TextInput";
import type { CustomApplication, CustomApplicationPreview } from "@/products/custom-applications/contracts";
import { customApplicationSandboxHtml } from "@/products/custom-applications/client";

type CheckId = "build" | "desktop" | "mobile" | "keyboard";
type ReviewCheck = { id: CheckId; passed: boolean; evidence: string };
type ReviewCheckDraft = Record<CheckId, ReviewCheck>;

const checkLabels: Record<CheckId, string> = {
  build: "Restricted build receipt",
  desktop: "Desktop render",
  mobile: "Mobile render",
  keyboard: "Keyboard path",
};

function emptyChecks(): ReviewCheckDraft {
  return {
    build: { id: "build", passed: false, evidence: "" },
    desktop: { id: "desktop", passed: false, evidence: "" },
    mobile: { id: "mobile", passed: false, evidence: "" },
    keyboard: { id: "keyboard", passed: false, evidence: "" },
  };
}

function errorText(body: unknown, fallback: string) {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : fallback;
}

function budgetDollars(value: number | null | undefined): string {
  return value === null || value === undefined ? "0" : (value / 100).toFixed(2);
}

function budgetCents(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000) return null;
  return Math.round(amount * 100);
}

export function CustomApplicationManageExperience({ workId, readOnly = false }: { workId: string; readOnly?: boolean }) {
  const [application, setApplication] = useState<CustomApplication | null>(null);
  const [preview, setPreview] = useState<CustomApplicationPreview | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [budgetMaximum, setBudgetMaximum] = useState(() => typeof window === "undefined" ? "0" : new URLSearchParams(window.location.search).get("maxAuthorizedCents") ? (Number(new URLSearchParams(window.location.search).get("maxAuthorizedCents")) / 100).toFixed(2) : "0");
  const [budgetEstimate, setBudgetEstimate] = useState(() => typeof window === "undefined" ? "0" : new URLSearchParams(window.location.search).get("estimateCents") ? (Number(new URLSearchParams(window.location.search).get("estimateCents")) / 100).toFixed(2) : "0");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reviewChecks, setReviewChecks] = useState<ReviewCheckDraft>(() => emptyChecks());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/custom-applications/${encodeURIComponent(workId)}/manage`, { cache: "no-store", headers: { Accept: "application/json" } });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(body, "The custom application could not be loaded."));
      const next = (body as { application: CustomApplication }).application;
      setApplication(next);
      setTitle(next.candidate.title);
      setSource(next.candidate.files["build.mjs"] ?? "");
      if (next.budget) {
        setBudgetMaximum(budgetDollars(next.budget.maxAuthorizedCents));
        setBudgetEstimate(budgetDollars(next.budget.estimateCents));
      }
      if (next.candidate.artifact) {
        const previewResponse = await fetch(`/api/custom-applications/${encodeURIComponent(workId)}/manage/preview`, { cache: "no-store", headers: { Accept: "application/json" } });
        const previewBody: unknown = await previewResponse.json().catch(() => null);
        if (!previewResponse.ok) throw new Error(errorText(previewBody, "The built artifact preview could not be loaded."));
        const nextPreview = (previewBody as { preview: CustomApplicationPreview }).preview;
        if (nextPreview.artifactDigest !== next.candidate.artifact.artifactDigest) throw new Error("The preview digest does not match the candidate artifact. Reload before reviewing it.");
        setPreview(nextPreview);
      } else {
        setPreview(null);
      }
    } finally {
      setLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    void load().catch(cause => {
      setApplication(null);
      setPreview(null);
      setError(cause instanceof Error ? cause.message : "The custom application could not be loaded.");
    });
  }, [load]);

  const artifactDigest = application?.candidate.artifact?.artifactDigest;
  useEffect(() => {
    const next = emptyChecks();
    if (artifactDigest) {
      next.build = {
        id: "build",
        passed: true,
        evidence: `Build receipt confirmed for artifact ${artifactDigest}.`,
      };
    }
    // A new artifact must be inspected again. This effect only runs when its
    // digest changes, so notes remain editable while the same artifact is open.
    setReviewChecks(next);
  }, [artifactDigest]);

  const action = useCallback(async (kind: string, input?: unknown) => {
    if (readOnly) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/custom-applications/${encodeURIComponent(workId)}/manage`, {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind, ...(input === undefined ? {} : { input }) }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(body, "The lifecycle change could not be confirmed."));
      if (body && typeof body === "object" && "application" in body) setApplication((body as { application: CustomApplication }).application);
      setNotice(kind === "build" ? "Candidate built. Review the exact artifact before releasing it." : kind === "review" ? "Artifact review recorded." : kind === "release" ? "Release is live for newly issued access." : kind === "rollback" ? "The selected release is live again." : "Candidate saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The lifecycle change could not be confirmed.");
    } finally { setBusy(false); }
  }, [load, readOnly, workId]);

  const artifact = application?.candidate.artifact;
  const checks = Object.values(reviewChecks);
  const canReview = Boolean(application && artifact && preview?.artifactDigest === artifact.artifactDigest && !artifact.review && checks.every(check => check.passed && check.evidence.trim().length > 0));
  const canRelease = Boolean(application && artifact?.review);
  const canAdmitBudget = budgetCents(budgetMaximum) !== null
    && budgetCents(budgetEstimate) !== null
    && budgetCents(budgetEstimate)! <= budgetCents(budgetMaximum)!;
  const releaseVersion = application?.currentReleaseVersion;
  const rollbackVersions = useMemo(() => application?.releases.filter(release => release.version !== releaseVersion) ?? [], [application, releaseVersion]);

  if (!application) return <div className="mx-auto max-w-4xl px-6 py-12">{loading ? <p role="status" className="text-sm text-gray-muted">Loading custom application…</p> : <section className="space-y-4 rounded-2xl border border-gray-border bg-surface p-6" aria-labelledby="custom-manage-error-heading"><h1 id="custom-manage-error-heading" className="font-display text-2xl font-medium">Custom application unavailable</h1><p role="alert" className="text-sm leading-6 text-gray-fg">{error || "The custom application could not be loaded."}</p><Button type="button" variant="secondary" onClick={() => void load().catch(cause => { setApplication(null); setPreview(null); setError(cause instanceof Error ? cause.message : "The custom application could not be loaded."); })}>Try again</Button></section>}</div>;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 text-warm-black sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-gray-muted">Custom application delivery</p>
        <h1 className="font-display text-3xl font-medium sm:text-4xl">{application.title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-gray-fg">{readOnly ? "Inspect the exact reviewed artifact and release history. Existing access stays on its granted release." : "Build a bounded candidate, inspect the exact artifact, then release it to named recipients. Existing access stays on its granted release."}</p>
      </header>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Application state">
        <div className="rounded-2xl border border-gray-border bg-surface p-4"><p className="text-xs text-gray-muted">Status</p><p className="mt-2 text-sm font-medium">{application.status}</p></div>
        <div className="rounded-2xl border border-gray-border bg-surface p-4"><p className="text-xs text-gray-muted">Candidate</p><p className="mt-2 text-sm font-medium">v{application.candidate.version} · revision {application.candidate.revision}</p></div>
        <div className="rounded-2xl border border-gray-border bg-surface p-4"><p className="text-xs text-gray-muted">Live release</p><p className="mt-2 text-sm font-medium">{releaseVersion ? `v${releaseVersion}` : "Not released"}</p></div>
      </section>
      {!readOnly && !application.budget && application.status !== "retired" ? <section className="space-y-5 rounded-2xl border border-terra/30 bg-terra/5 p-5 sm:p-7" aria-labelledby="custom-budget-heading">
        <div><h2 id="custom-budget-heading" className="font-display text-2xl font-medium">Finish local build authorization</h2><p className="mt-2 text-sm leading-6 text-gray-fg">This draft is saved, but its local budget admission did not finish. Retry here to continue the same work without creating a duplicate application.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Maximum authorized budget (USD)" type="number" min="0" max="10000" step="0.01" value={budgetMaximum} onChange={event => setBudgetMaximum(event.target.value)} disabled={busy} />
          <TextInput label="Expected build cost (USD)" type="number" min="0" max="10000" step="0.01" value={budgetEstimate} onChange={event => setBudgetEstimate(event.target.value)} disabled={busy} />
        </div>
        <Button type="button" disabled={busy || !canAdmitBudget} onClick={() => void action("admit_budget", { maxAuthorizedCents: budgetCents(budgetMaximum), estimateCents: budgetCents(budgetEstimate) })}>Retry budget admission</Button>
      </section> : null}
      <section className="space-y-5 rounded-2xl border border-gray-border bg-surface p-5 sm:p-7" aria-labelledby="custom-preview-heading">
        <div><h2 id="custom-preview-heading" className="font-display text-2xl font-medium">Artifact preview</h2><p className="mt-2 text-sm leading-6 text-gray-fg">Inspect the exact HTML returned by the restricted build before recording review evidence. Local scripts can respond inside the sandbox; fetches and external code sources are blocked, and outgoing links stay inside the preview.</p></div>
        {preview ? <>
          <div className="flex flex-wrap items-center gap-2" aria-label="Preview size">
            <Button type="button" size="sm" variant={previewMode === "desktop" ? "primary" : "secondary"} onClick={() => setPreviewMode("desktop")} disabled={busy}>Desktop 1280px</Button>
            <Button type="button" size="sm" variant={previewMode === "mobile" ? "primary" : "secondary"} onClick={() => setPreviewMode("mobile")} disabled={busy}>Mobile 390px</Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-border bg-surface-inset p-3">
            <iframe
              title={`${application.title} ${previewMode} artifact preview`}
              sandbox="allow-scripts allow-forms"
              srcDoc={customApplicationSandboxHtml(preview.html)}
              referrerPolicy="no-referrer"
              style={{ width: previewMode === "desktop" ? "1280px" : "390px", height: previewMode === "desktop" ? "560px" : "720px", maxWidth: "100%" }}
              className="block border-0 bg-white"
            />
          </div>
          <p className="break-all font-mono text-xs text-gray-muted">Artifact digest: {preview.artifactDigest}</p>
        </> : <p className="rounded-xl border border-dashed border-gray-border p-4 text-sm text-gray-muted">Build a candidate to inspect its immutable artifact.</p>}
      </section>
      {!readOnly ? <details className="rounded-2xl border border-gray-border bg-surface p-5 sm:p-7">
        <summary className="cursor-pointer font-display text-2xl font-medium">Advanced candidate source</summary>
        <div className="mt-5 space-y-5">
          <p className="text-sm leading-6 text-gray-fg">The source stays private to this workspace. Saving a candidate does not change what recipients use.</p>
          <TextInput label="Title" value={title} onChange={event => setTitle(event.target.value)} disabled={busy} />
          <TextArea label="build.mjs" id="custom-build-entry" value={source} onChange={event => setSource(event.target.value)} disabled={busy} rows={8} className="font-mono text-xs leading-5" />
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={busy} onClick={() => void action("revise", { expectedCandidateRevision: application.candidate.revision, title, files: { ...application.candidate.files, "build.mjs": source } })}>Save candidate</Button>
            <Button type="button" variant="secondary" disabled={busy || !application.budget} onClick={() => void action("build", { expectedCandidateRevision: application.candidate.revision })}>Build candidate</Button>
          </div>
        </div>
      </details> : null}
      <section className="space-y-5 rounded-2xl border border-gray-border bg-surface p-5 sm:p-7" aria-labelledby="custom-review-heading">
        <div><h2 id="custom-review-heading" className="font-display text-2xl font-medium">Review and release</h2><p className="mt-2 text-sm leading-6 text-gray-fg">A release requires the exact built digest and all four local checks.</p></div>
        {artifact ? <p className="break-all rounded-xl bg-surface-inset p-3 font-mono text-xs text-gray-muted">{artifact.artifactDigest}</p> : <p className="rounded-xl border border-dashed border-gray-border p-4 text-sm text-gray-muted">No candidate artifact yet.</p>}
        <div className="grid gap-3" aria-label="Artifact review checks">
          {(Object.keys(checkLabels) as CheckId[]).map(id => {
            const check = reviewChecks[id];
            const automatic = id === "build";
            return (
              <fieldset key={id} className="rounded-xl border border-gray-border p-4">
                <label className="flex items-start gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={check.passed}
                    disabled={busy || readOnly || automatic || !artifact}
                    onChange={event => setReviewChecks(current => ({ ...current, [id]: { ...current[id], passed: event.target.checked } }))}
                    className="mt-1 size-4 accent-accent"
                  />
                  <span>{checkLabels[id]}{automatic ? <span className="ml-2 text-xs font-normal text-gray-muted">set by the build receipt</span> : null}</span>
                </label>
                <TextArea
                  label={automatic ? "Receipt evidence" : "What did you inspect?"}
                  value={check.evidence}
                  disabled={busy || readOnly || automatic || !artifact}
                  onChange={event => setReviewChecks(current => ({ ...current, [id]: { ...current[id], evidence: event.target.value } }))}
                  helperText={automatic ? "This text is tied to the returned artifact digest." : "Write the observed local result before checking this item."}
                  className="mt-3"
                  rows={2}
                />
              </fieldset>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3">
          {!readOnly ? <>
            <Button type="button" variant="secondary" disabled={busy || !canReview} onClick={() => void action("review", { expectedCandidateRevision: application.candidate.revision, artifactDigest: artifact!.artifactDigest, checks: checks.map(check => ({ ...check, passed: true as const })) })}>Record review checks</Button>
            <Button type="button" disabled={busy || !canRelease} onClick={() => void action("release", { expectedCandidateRevision: application.candidate.revision, expectedReleaseVersion: application.currentReleaseVersion })}>Release candidate</Button>
            {rollbackVersions.map(release => <Button key={release.version} type="button" variant="secondary" disabled={busy} onClick={() => void action("rollback", { expectedReleaseVersion: application.currentReleaseVersion, version: release.version })}>Rollback to v{release.version}</Button>)}
          </> : null}
        </div>
        {notice ? <p role="status" className="rounded-xl border border-sage/30 bg-sage/5 p-3 text-sm text-sage-dark">{notice}</p> : null}
        {error ? <p role="alert" className="rounded-xl border border-terra/30 bg-terra/5 p-3 text-sm text-terra">{error}</p> : null}
      </section>
    </div>
  );
}
