"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/TextInput";

const starter = `import { writeFile } from "node:fs/promises";

await writeFile(
  "/output/index.html",
  "<main><h1>Hello from your local application</h1></main>",
);`;

function cents(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function CustomApplicationCreateExperience({ workspaceId, onSaved }: { workspaceId: string; onSaved?: (workId: string, recovery?: { maxAuthorizedCents: number; estimateCents: number | null }) => void }) {
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
      setError("Enter an estimate at or below the maximum authorized budget.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/custom-applications", {
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
          ? (body as { error: string }).error : "The custom application could not be created.";
        throw new Error(message);
      }
      const workId = body && typeof body === "object" && typeof (body as { application?: { workId?: unknown } }).application?.workId === "string"
        ? (body as { application: { workId: string } }).application.workId : null;
      if (!workId) throw new Error("The custom application was created without a workspace record.");
      if (onSaved) onSaved(workId);
      else router.push(`/custom-applications/${encodeURIComponent(workId)}/manage`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The custom application could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 text-warm-black sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-gray-muted">Custom application delivery</p>
        <h1 className="font-display text-3xl font-medium sm:text-4xl">Create a local application</h1>
        <p className="max-w-2xl text-sm leading-6 text-gray-fg">Name the outcome, provide the build source, and authorize the maximum local build budget. The signed-in workspace owner becomes the named maintenance owner.</p>
      </header>
      <form className="space-y-6 rounded-2xl border border-gray-border bg-surface p-5 sm:p-7" onSubmit={submit}>
        <TextInput label="Application name" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} disabled={busy} />
        <TextArea label="build.mjs" value={source} onChange={event => setSource(event.target.value)} required rows={10} disabled={busy} className="font-mono text-xs leading-5" helperText="The local builder must write the final HTML to /output/index.html. Network access is disabled." />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Maximum authorized budget (USD)" type="number" min="0" max="10000" step="0.01" value={maximum} onChange={event => setMaximum(event.target.value)} required disabled={busy} helperText="The build cannot exceed this amount." />
          <TextInput label="Expected build cost (USD)" type="number" min="0" max="10000" step="0.01" value={estimate} onChange={event => setEstimate(event.target.value)} required disabled={busy} helperText="Use $0 when the local build has no reported cost." />
        </div>
        {error ? <p role="alert" className="rounded-xl border border-terra/30 bg-terra/5 p-3 text-sm text-terra">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} disabled={!title.trim() || !source.trim()}>Create application</Button>
          <p className="text-xs leading-5 text-gray-muted">No external provider, paid model, or public deployment is started.</p>
        </div>
      </form>
    </main>
  );
}
