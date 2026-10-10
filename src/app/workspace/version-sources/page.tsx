import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleasedFor } from "@/platform/systems-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { listWorkspaces } from "@/platform/workspaces";
import { readPrivateApplicationSources } from "@/experience/workspace/agency/private-definition-server";
import PrivateSourceAuthoring from "./PrivateSourceAuthoring";
export const dynamic = "force-dynamic";
export default async function PrivateSourcesPage({ searchParams }: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    if (!workspaceReleaseEnabled())
        notFound();
    const actor = await workspaceHttpActor();
    if (!actor)
        redirect("/sign-in");
    const params = await searchParams;
    try {
        const workspaceId = z.string().uuid().parse(params.workspaceId);
        const workspaces = await listWorkspaces(actor);
        const current = workspaces.find(w => w.id === workspaceId && w.access === "member" && ["customer", "agency"].includes(w.kind));
        if (!current || !await systemsReleasedFor(actor, workspaceId))
            throw Error("Source access is unavailable.");
        const incoming = params.sourceSystemId ? z.object({ businessId: z.string().uuid(), systemId: z.string().uuid(), revisionId: z.string().uuid(), number: z.coerce.number().int().positive() }).parse({ businessId: params.sourceWorkspaceId, systemId: params.sourceSystemId, revisionId: params.revisionId, number: params.number }) : undefined;
        const graph = await readPrivateApplicationSources(actor, workspaceId, incoming);
        return <main className="mx-auto max-w-3xl px-6 py-12"><Link className="inline-flex min-h-12 items-center underline" href={`/workspace?workspaceId=${workspaceId}`}>Back to workspace</Link><h1 className="mt-6 font-display text-3xl">Reusable applications</h1><p className="mt-4">Make a reusable form, share its definition, and let each business decide what to install and release. Records and account access stay with each business.</p><PrivateSourceAuthoring key={workspaceId} graph={graph} targets={workspaces.filter(w => w.kind === "customer").map(w => ({ id: w.id, name: w.name }))}/></main>;
    }
    catch {
        return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="font-display text-3xl">Reusable applications</h1><p role="alert" className="mt-6">Sources could not be loaded. Confirm current workspace membership and try again.</p></main>;
    }
}
