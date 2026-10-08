import { notFound } from "next/navigation";
import { BillingPreview } from "./BillingPreview";
export default async function Page({searchParams}:{searchParams:Promise<{mode?:string}>}) {
 if(process.env.NODE_ENV!=="development"||process.env.STRELVA_UI_PREVIEW!=="1")notFound();
 return <BillingPreview mode={(await searchParams).mode??"agency-pending"}/>;
}
