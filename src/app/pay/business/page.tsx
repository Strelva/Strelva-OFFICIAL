import {notFound} from "next/navigation";
import {connectEnabled} from "@/platform/connect";
import BusinessPayment from "./BusinessPayment";
export const dynamic="force-dynamic";
export const metadata={title:"Business payment",referrer:"no-referrer" as const,robots:{index:false,follow:false}};
export default async function PaymentPage({searchParams}:{searchParams:Promise<{token?:string}>}){if(!connectEnabled())notFound();const {token}=await searchParams;if(!token||!/^[a-f0-9]{64}$/.test(token))notFound();return <BusinessPayment key={token} token={token}/>;}
