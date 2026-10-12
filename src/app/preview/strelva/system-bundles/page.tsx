import {notFound} from "next/navigation";
import {strelvaUiPreviewEnabled} from "@/experience/workspace/preview/enabled";
import {BundlePackagePreview} from "@/experience/systems/BundlePackagePreview";
import {SystemsCanonShell} from "@/experience/workspace/preview/SystemsCanonShell";
import {StPage, StHead} from "@/components/ui/strelva/Kit";
export const dynamic="force-dynamic";
export const metadata={title:"System bundle preview",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{state?:string;mode?:string}>}){if(!strelvaUiPreviewEnabled())notFound();const {state="ready",mode}=await searchParams;return <SystemsCanonShell businessName="Elmwood" systemName="Apps" pins={[]} mode={mode === "dark" ? "dark" : "light"}><StPage><StHead title="Apps" meta="Review what each system does, then prepare private drafts for your business." /><BundlePackagePreview state={state}/></StPage></SystemsCanonShell>;}
