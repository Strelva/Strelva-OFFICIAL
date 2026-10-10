import { notFound } from "next/navigation";
import { BillingPreview } from "./BillingPreview";
import { OwnerMoneyPreview } from "@/experience/workspace/preview/OwnerMoneyPreview";
export default async function Page({searchParams}:{searchParams:Promise<{mode?:string;state?:string}>}) {
 if(process.env.NODE_ENV!=="development"||process.env.STRELVA_UI_PREVIEW!=="1")notFound();
 const {mode,state}=await searchParams;
 return mode && mode !== "dark" && mode !== "light" ? <BillingPreview mode={mode}/> : <OwnerMoneyPreview surface="billing" state={state} mode={mode}/>;
}
