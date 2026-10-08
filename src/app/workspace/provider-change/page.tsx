import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {moneyRpc} from "@/platform/connect";
import {workspaceHttpActor} from "@/platform/workspaces/http";
import {workspaceReleaseEnabled} from "@/platform/workspace-release";
import ProviderChangeNotices,{type ProviderChangeNotice} from "./ProviderChangeNotices";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{workspaceId?:string}>}){if(!workspaceReleaseEnabled()||process.env.STRELVA_PROVIDER_CHANGE!=="1")notFound();const actor=await workspaceHttpActor();if(!actor)redirect("/sign-in");const {workspaceId}=await searchParams;let requests:ProviderChangeNotice[];try{requests=await moneyRpc("read_provider_change_requests",{p_workspace_id:workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail});}catch{return <main className="mx-auto max-w-xl px-6 py-12"><h1 className="font-display text-2xl">Provider changes</h1><p role="alert" className="mt-6">Provider changes could not be loaded. Confirm your access and try again.</p></main>;}return <main className="mx-auto max-w-xl px-6 py-12"><Link className="inline-flex min-h-12 items-center underline" href={`/workspace?workspaceId=${workspaceId}`}>Back to workspace</Link><h1 className="mt-6 font-display text-2xl">Provider changes</h1><ProviderChangeNotices key={workspaceId} workspaceId={workspaceId??""} requests={requests}/></main>;}
