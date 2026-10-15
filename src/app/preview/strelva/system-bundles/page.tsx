import {notFound} from "next/navigation";
import {strelvaUiPreviewEnabled} from "@/experience/workspace/preview/enabled";
import {ConnectionsLibraryPreview} from "@/experience/systems/ConnectionsLibraryPreview";
import {BundlePackagePreview} from "@/experience/systems/BundlePackagePreview";
import {SystemsCanonShell} from "@/experience/workspace/preview/SystemsCanonShell";
import {StPage, StHead} from "@/components/ui/strelva/Kit";
export const dynamic="force-dynamic";
export const metadata={title:"System bundle preview",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{state?:string;mode?:string;surface?:string}>}){if(!strelvaUiPreviewEnabled())notFound();const {state="ready",mode,surface}=await searchParams;return <SystemsCanonShell businessName={surface === "library" ? "North Studio" : "Harbor Dental"} systemName={surface === "library" ? "Library" : "Apps"} pins={[]} mode={mode === "dark" ? "dark" : "light"}><StPage><StHead title={surface === "library" ? "Library" : "Apps"} meta="Review what each system does, then prepare private drafts for your business." />{surface === "library" ? <ConnectionsLibraryPreview state={state} /> : <BundlePackagePreview state={state}/>}</StPage></SystemsCanonShell>;}
