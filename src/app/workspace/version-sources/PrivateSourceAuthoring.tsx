"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { SourcePackageControls } from "@/experience/workspace/agency/SourcePackageControls";
import type { readPrivateApplicationSources } from "@/experience/workspace/agency/private-definition-server";
export type PrivateSourceGraph = Awaited<ReturnType<typeof readPrivateApplicationSources>>;
const ref = z.object({ businessId: z.string().uuid(), systemId: z.string().uuid(), revisionId: z.string().uuid(), number: z.number().int().positive() }).strict();
export default function PrivateSourceAuthoring({ graph, targets }: {
    graph: PrivateSourceGraph;
    targets: Array<{
        id: string;
        name: string;
    }>;
}) {
    const router = useRouter();
    const [name, setName] = useState(""), [question, setQuestion] = useState(""), [target, setTarget] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState(""), [shareLink, setShareLink] = useState("");
    const inFlight = useRef(false), pending = useRef<{
        kind: "create";
        name: string;
        question: string;
        createId: string;
        revisionId: string;
    } | {
        kind: "command";
        data: Record<string, unknown>;
    } | null>(null);
    const [uncertain, setUncertain] = useState(false);
    const observation = useRef<AbortController | null>(null);
    const mounted = useRef(true);
    const authority = useRef(graph.canAuthor);
    authority.current = graph.canAuthor;
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; observation.current?.abort(); }; }, []);
    async function post(data: Record<string, unknown>) { const response = await fetch("/api/workspace/version-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal: observation.current?.signal }); const value: unknown = await response.json().catch(() => null); if (!mounted.current || !authority.current)
        throw Error("Current source authority must be reloaded."); const refusal = z.object({ error: z.string() }).safeParse(value); if (!response.ok)
        throw Error(refusal.success ? refusal.data.error : "The source command could not be confirmed."); return value; }
    async function run(attempt: NonNullable<typeof pending.current>) {
        if (inFlight.current || !graph.canAuthor)
            return;
        if (attempt.kind === "create" && (!attempt.name.trim() || attempt.name.length > 160 || !attempt.question.trim() || attempt.question.length > 80)) {
            setError("Enter an application name and a question label of up to 80 characters.");
            return;
        }
        inFlight.current = true;
        observation.current = new AbortController();
        pending.current = attempt;
        setBusy(true);
        setError("");
        setStatus("");
        try {
            if (attempt.kind === "create") {
                const created = z.object({ source: z.object({ businessId: z.literal(graph.workspaceId), systemId: z.string().uuid() }).strict(), hidden: z.literal(true) }).strict().parse(await post({ action: "create", workspaceId: graph.workspaceId, name: attempt.name, commandId: attempt.createId }));
                const published = z.object({ source: ref }).passthrough().parse(await post({ action: "publish", workspaceId: graph.workspaceId, systemId: created.source.systemId, commandId: attempt.revisionId, expectedRevision: 0, summary: "Reusable request form", definition: { kind: "internal_app", title: attempt.name, fields: [{ id: "request", label: attempt.question, type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }] } }));
                if (published.source.businessId !== graph.workspaceId || published.source.systemId !== created.source.systemId || published.source.revisionId !== attempt.revisionId || published.source.number !== 1)
                    throw Error("The exact source revision could not be confirmed.");
                setStatus("Source revision saved. Exact checks and human qualification are still required before installation.");
            }
            else {
                const value = await post(attempt.data);
                if (attempt.data.action === "share") {
                    const shared = z.object({ source: z.object({ businessId: z.literal(graph.workspaceId), systemId: z.literal(String(attempt.data.systemId)) }).strict(), sharedWith: z.array(z.string().uuid()) }).passthrough().parse(value);
                    if (!shared.sharedWith.includes(String(attempt.data.businessId)))
                        throw Error("This business's source share could not be confirmed.");
                    const selected = graph.sources.find(s => s.systemId === attempt.data.systemId)?.revision;
                    if (!selected)
                        throw Error("Reload the exact source revision.");
                    setShareLink(`/workspace/version-sources?${new URLSearchParams({ workspaceId: String(attempt.data.businessId), sourceWorkspaceId: selected.businessId, sourceSystemId: selected.systemId, revisionId: selected.revisionId, number: String(selected.number) })}`);
                    setStatus("Definition shared. The receiving business still chooses installation and release.");
                }
                else {
                    const installed = z.object({ workspaceId: z.literal(graph.workspaceId), systemId: z.string().uuid(), versionId: z.string().uuid(), rowRevision: z.number().int().positive(), outcome: z.literal("created") }).strict().parse(value);
                    setStatus("A separate draft Version was created. Owner approval is still required before it goes live.");
                    setShareLink(`/workspace?workspaceId=${graph.workspaceId}&view=system&system=${installed.systemId}`);
                }
            }
            pending.current = null;
            setUncertain(false);
            router.refresh();
        }
        catch (caught) {
            if (!mounted.current)
                return;
            setUncertain(true);
            setError(caught instanceof z.ZodError ? "The exact source command could not be confirmed. Retry the same command." : caught instanceof Error ? caught.message : "The source command is unconfirmed. Retry the same command before changing it.");
        }
        finally {
            inFlight.current = false;
            if (mounted.current)
                setBusy(false);
        }
    }
    const locked = busy || uncertain;
    return <div className="mt-8 grid gap-6">
 <Card padding="lg"><h2 className="font-display text-xl">Your source definitions</h2>{graph.sources.length ? <ul className="mt-4 space-y-6">{graph.sources.map(source => <li key={source.systemId}><h3 className="font-medium">{source.name}</h3><p className="mt-2 text-sm">{source.revision ? `Revision ${source.revision.number} · ${source.qualified ? "Qualified" : "Qualification pending"}` : "No revision published"}</p>{graph.canAuthor ? <>{!locked ? <SourcePackageControls request={fetch} workspaceId={graph.workspaceId} systemId={source.systemId}/> : null}{source.revision ? <Button variant="secondary" disabled={locked || !target} onClick={() => void run({ kind: "command", data: { action: "share", workspaceId: graph.workspaceId, systemId: source.systemId, businessId: target, shared: true } })}>Share {source.name}</Button> : null}</> : null}</li>)}</ul> : <p className="mt-4">No reusable application source has been created here.</p>}{graph.canAuthor ? <SelectInput className="mt-6 min-h-12" label="Receiving business" value={target} disabled={locked} onChange={e => setTarget(e.target.value)} options={[{ value: "", label: "Choose a business" }, ...targets.map(t => ({ value: t.id, label: t.name }))]}/> : null}</Card>
 {graph.canAuthor ? <Card padding="lg"><h2 className="font-display text-xl">Create a reusable request form</h2><form className="mt-6 grid gap-4" onSubmit={e => { e.preventDefault(); void run({ kind: "create", name: name.trim(), question: question.trim(), createId: crypto.randomUUID(), revisionId: crypto.randomUUID() }); }}><TextInput label="Application name" required maxLength={160} value={name} disabled={locked} onChange={e => setName(e.target.value)}/><TextInput label="Question label" required maxLength={80} value={question} disabled={locked} onChange={e => setQuestion(e.target.value)}/><Button type="submit" disabled={locked || !name.trim() || !question.trim()} loading={busy}>Save reusable source</Button></form></Card> : <p role="status">Source changes and installation require current owner or admin access in an active business workspace.</p>}
 {graph.shared ? <Card padding="lg"><h2 className="font-display text-xl">Shared with this business</h2><p className="mt-4">{graph.shared.name} · exact revision {graph.shared.source.number} · {graph.shared.qualified ? "Qualified" : "Qualification pending"}</p><p className="mt-4 text-sm">Installation creates a separate draft with its own records and empty account bindings. Release remains the business owner’s decision.</p><Button className="mt-6" disabled={locked || !graph.canAuthor || !graph.shared.qualified} onClick={() => void run({ kind: "command", data: { action: "install", workspaceId: graph.workspaceId, source: graph.shared!.source, name: graph.shared!.name, commandId: crypto.randomUUID() } })}>Create separate draft Version</Button></Card> : null}
 {error ? <p role="alert">{error}</p> : null}{uncertain && graph.canAuthor ? <Button variant="secondary" disabled={busy} onClick={() => { if (pending.current)
        void run(pending.current); }}>Retry the same source command</Button> : null}{status ? <p role="status">{status}</p> : null}{shareLink ? <Link className="inline-flex min-h-12 items-center underline" href={shareLink}>Open the receiving business</Link> : null}
 </div>;
}
