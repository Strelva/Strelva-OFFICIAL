import {notFound} from "next/navigation";
import {createHash} from "node:crypto";
import {connectEnabled,moneyRpc} from "@/platform/connect";
import {publicPaymentRequestSchema} from "@/platform/connect/public-payment";
import {readVisitorBrandForWorkspace} from "@/products/websites";
import BusinessPayment from "./BusinessPayment";
export const dynamic="force-dynamic";
export const metadata={title:"Business payment",referrer:"no-referrer" as const,robots:{index:false,follow:false}};
/** The charging business's own look, read from the request's workspace. Presentation only: a failed read is the unbranded page, and the client still loads the request itself. */
async function brandFor(token:string){try{const request=publicPaymentRequestSchema.safeParse(await moneyRpc("read_public_payment_request",{p_hash:createHash("sha256").update(token).digest("hex")}));return request.success?await readVisitorBrandForWorkspace(request.data.workspaceId):null;}catch{return null;}}
export default async function PaymentPage({searchParams}:{searchParams:Promise<{token?:string}>}){if(!connectEnabled())notFound();const {token}=await searchParams;if(!token||!/^[a-f0-9]{64}$/.test(token))notFound();return <BusinessPayment key={token} token={token} brand={await brandFor(token)}/>;}
