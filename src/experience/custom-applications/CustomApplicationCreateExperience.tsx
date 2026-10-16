"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { XaButton, XaDecision, XaField, XaHeadline, XaStatus, XaSystemTile, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaNote, XaObjectPage } from "@/components/ui/strelva/Xa";
import styles from "@/experience/applications/application-use.module.css";

const starter = `import { writeFile } from "node:fs/promises";

await writeFile(
  "/output/index.html",
  "<main><h1>Hello from your local internal tool</h1></main>",
);`;

function cents(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

/**
 * Making an internal tool from a build file. Only for the people who build:
 * the business's agency, or an agency in its own workspace. Owners get
 * CustomToolRequest instead, which asks their agency in plain words.
 */
export function CustomApplicationCreateExperience({ workspaceId, businessName = "this business", onSaved, request = fetch }: { workspaceId: string; businessName?: string; onSaved?: (workId: string, recovery?: { maxAuthorizedCents: number; estimateCents: number | null }) => void; request?: typeof fetch }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [source, setSource] = useState(starter);
  const [maximum, setMaximum] = useState("0");
  const [estimate, setEstimate] = useState("0");
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const maxAuthorizedCents = cents(maximum);
    const estimateCents = cents(estimate);
    if (maxAuthorizedCents === null || estimateCents === null || estimateCents > maxAuthorizedCents) {
      setError(maxAuthorizedCents === null ? "Write the stop amount as dollars, like 2.50." : "What you expect has to be at or below where the build stops.");
      setBusy(false);
      return;
    }
    try {
      const response = await request("/api/custom-applications", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          application: {
            title,
            files: { "build.mjs": source },
            budget: { maxAuthorizedCents, estimateCents },
          },
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const draftWorkId = body && typeof body === "object" && typeof (body as { draftWorkId?: unknown }).draftWorkId === "string"
          ? (body as { draftWorkId: string }).draftWorkId : null;
        if (draftWorkId) {
          const draftBudget = body && typeof body === "object" && (body as { draftBudget?: unknown }).draftBudget && typeof (body as { draftBudget: { maxAuthorizedCents?: unknown } }).draftBudget.maxAuthorizedCents === "number"
            ? (body as { draftBudget: { maxAuthorizedCents: number; estimateCents?: unknown } }).draftBudget : null;
          const recovery = draftBudget ? {
            maxAuthorizedCents: draftBudget.maxAuthorizedCents,
            estimateCents: typeof draftBudget.estimateCents === "number" ? draftBudget.estimateCents : null,
          } : undefined;
          if (onSaved) onSaved(draftWorkId, recovery);
          else {
            const query = new URLSearchParams({ budgetRecovery: "1" });
            if (recovery) {
              query.set("maxAuthorizedCents", String(recovery.maxAuthorizedCents));
              query.set("estimateCents", String(recovery.estimateCents ?? ""));
            }
            router.push(`/custom-applications/${encodeURIComponent(draftWorkId)}/manage?${query.toString()}`);
          }
          return;
        }
        const message = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error : "The internal tool could not be created.";
        throw new Error(message);
      }
      const workId = body && typeof body === "object" && typeof (body as { application?: { workId?: unknown } }).application?.workId === "string"
        ? (body as { application: { workId: string } }).application.workId : null;
      if (!workId) throw new Error("The internal tool was made, but its record could not be saved. Reload to check.");
      if (onSaved) onSaved(workId);
      else router.push(`/custom-applications/${encodeURIComponent(workId)}/manage`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The internal tool could not be created.");
    } finally {
      setBusy(false);
    }
  }

  const max = cents(maximum);
  const costLine = max === null ? "Write the stop amount as dollars, like 2.50."
    : `Strelva stops the build at ${dollars(max)}${max === 0 ? ", so it runs only if it costs nothing" : ""}. It counts toward ${businessName}'s usage this month.`;
  const missing = !title.trim() ? "Name it first." : !source.trim() ? "Add the build file first." : "";
  return <XaObjectPage label="Make an internal tool from code" phone="object-first"
    head={<>
      <XaSystemTile kind="form" size={48} label="Internal tool" />
      <XaHeadline quiet={`${businessName} reviews it before anyone uses it.`}>A new internal tool, from your code.</XaHeadline>
    </>}
    story={<XaNote>The build runs on its own machine with no internet. It writes one page, and that page is the tool. You&apos;re named as the person who keeps it working.</XaNote>}
    object={<XaDecision label="The internal tool" status={<XaStatus kind="draft">Draft</XaStatus>} meta={`${businessName} · Internal tool`} yes={null}>
      <form className={styles.form} onSubmit={event => { if (missing) { event.preventDefault(); setError(missing); return; } void submit(event); }} aria-label="Make an internal tool" noValidate>
        <XaField label="Name" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} disabled={busy} placeholder="Consultation planner" />
        <XaTextArea label="Build file" value={source} onChange={event => setSource(event.target.value)} required rows={10} disabled={busy} spellCheck={false}
          hint="It writes the finished page to /output/index.html." />
        <XaField label="Stop the build at, in dollars" type="number" min="0" max="10000" step="0.01" inputMode="decimal" value={maximum} onChange={event => setMaximum(event.target.value)} required disabled={busy} hint={costLine} />
        {estimateOpen ? <XaField label="You expect about, in dollars" type="number" min="0" max="10000" step="0.01" inputMode="decimal" value={estimate} onChange={event => setEstimate(event.target.value)} disabled={busy} hint="Shown beside the build so you can compare." />
          : <p className={styles.quietLine}><XaTextLink onClick={() => setEstimateOpen(true)}>Add what you expect it to cost</XaTextLink></p>}
        {error ? <XaNote tone="down" role="alert">{error}</XaNote> : null}
        <div className={styles.actions}>
          <XaButton type="submit" variant="primary" size="lg" busy={busy}>Make the internal tool</XaButton>
          {missing ? <span className={styles.reason}>{missing}</span> : null}
        </div>
      </form>
    </XaDecision>} />;
}

const dollars = (value: number) => `$${(value / 100).toFixed(2)}`;
