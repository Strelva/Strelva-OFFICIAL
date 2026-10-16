"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { XaAnswers, XaButton, XaDecision, XaField, XaHeadline, XaSystemTile, XaTextArea } from "@/components/ui/strelva/Xa";
import { XaNote, XaObjectPage } from "@/experience/xa-object/XaObjectPage";
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

export function CustomApplicationCreateExperience({ workspaceId, onSaved, request = fetch }: { workspaceId: string; onSaved?: (workId: string, recovery?: { maxAuthorizedCents: number; estimateCents: number | null }) => void; request?: typeof fetch }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [source, setSource] = useState(starter);
  const [maximum, setMaximum] = useState("0");
  const [estimate, setEstimate] = useState("0");
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
      setError("The expected cost has to be at or below the most it may cost.");
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
      if (!workId) throw new Error("The internal tool was created without a workspace record.");
      if (onSaved) onSaved(workId);
      else router.push(`/custom-applications/${encodeURIComponent(workId)}/manage`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The internal tool could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return <XaObjectPage label="Make an internal tool from code"
    story={<>
      <XaSystemTile kind="form" size={56} label="Internal tool" />
      <XaHeadline quiet="You review it before anyone uses it.">Make an internal tool from your own code.</XaHeadline>
      <XaAnswers labelWidth={130} rows={[
        ["You give it", "A name, one build file and the most the build may cost."],
        ["Strelva runs", "Your build file on its own machine. Nothing reaches the internet."],
        ["Who keeps it", "You, as the person signed in. You are named as the one who maintains it."],
        ["Nothing starts", "No outside service, paid model or public page is started here."],
      ]} />
    </>}
    object={<XaDecision label="The internal tool" status={<span className={styles.recordStatus}>New internal tool</span>} meta="Draft until you review it" yes={null}>
      <form className={styles.form} onSubmit={submit} aria-label="Make an internal tool">
        <XaField label="Name" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} disabled={busy} placeholder="Consultation planner" />
        <XaTextArea label="Build file (build.mjs)" value={source} onChange={event => setSource(event.target.value)} required rows={10} disabled={busy} spellCheck={false}
          hint="It must write the finished page to /output/index.html. The build has no internet." />
        <div className={styles.fields}>
          <XaField label="Most it may cost, in dollars" type="number" min="0" max="10000" step="0.01" value={maximum} onChange={event => setMaximum(event.target.value)} required disabled={busy} hint="The build stops before it costs more." />
          <XaField label="What you expect it to cost" type="number" min="0" max="10000" step="0.01" value={estimate} onChange={event => setEstimate(event.target.value)} required disabled={busy} hint="Use 0 when your build reports no cost." />
        </div>
        {error ? <XaNote tone="down" role="alert">{error}</XaNote> : null}
        <div className={styles.actions}>
          <XaButton type="submit" variant="primary" size="lg" busy={busy} disabled={!title.trim() || !source.trim()}>Make the internal tool</XaButton>
        </div>
      </form>
    </XaDecision>} />;
}
