import {notFound} from "next/navigation";
import {strelvaUiPreviewEnabled} from "@/experience/workspace/preview/enabled";
import {BundleNativeVersionPreview} from "@/experience/systems/BundleNativeVersionPreview";
export const dynamic="force-dynamic";
export const metadata={title:"Native Version review preview",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{state?:string}>}){if(!strelvaUiPreviewEnabled())notFound();const {state="ready"}=await searchParams;return <main data-workspace-scope="business" className="min-h-dvh bg-canvas px-6 py-10 text-warm-black sm:px-8"><div className="mx-auto max-w-4xl"><h1 className="mb-4 font-display text-3xl">Review this business’s native update</h1><p className="mb-8 text-sm text-gray-muted">Fictional business. These preview actions stay local; publication requires the existing owner review and native verification.</p><BundleNativeVersionPreview key={state} state={state}/></div></main>;}
