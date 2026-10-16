import type { Metadata } from "next";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { redirect } from "next/navigation";
import { WorkspaceExport } from "@/experience/workspace/WorkspaceExport";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Workspace export",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function Page({searchParams}:{searchParams:Promise<{workspaceId?:string|string[]}>}){if(!workspaceReleaseEnabled())redirect("/workspace");const id=(await searchParams).workspaceId;if(typeof id!=="string")redirect("/workspace");return <StrelvaShell workspaceId={id} title="Take it with you" active="settings" detailsPlace="export" systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}><WorkspaceExport workspaceId={id} schema3={process.env.STRELVA_EXPORT_SCHEMA_3 === "1"}/></StrelvaShell>;}
