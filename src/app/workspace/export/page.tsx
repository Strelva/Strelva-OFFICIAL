import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WorkspaceExport } from "@/experience/workspace/WorkspaceExport";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Workspace export",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function Page({searchParams}:{searchParams:Promise<{workspaceId?:string|string[]}>}){if(!workspaceReleaseEnabled())redirect("/workspace");const id=(await searchParams).workspaceId;if(typeof id!=="string")redirect("/workspace");return <WorkspaceExport workspaceId={id}/>;}
