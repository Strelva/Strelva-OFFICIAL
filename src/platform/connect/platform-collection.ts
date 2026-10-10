import {z} from "zod";
import {connectProfile,stripeClient,type ConnectDependencies,moneyRpc,connectDb} from "./index";
import {WorkspaceStoreError} from "@/platform/workspaces/types";
/** Agency/creator shares are accrued from an explicitly priced platform sale.
 * This rail never moves a business customer's direct-charge proceeds. */
export async function createPlatformCollection(input:{workspaceId:string;invoiceLineId:string;amountCents:number;currency:string;customerId:string;idempotencyKey:string;agreementVersion:string;installationId?:string},deps:ConnectDependencies={}) {
 if(process.env.STRELVA_PLATFORM_COLLECTION!=="1")throw new WorkspaceStoreError("Platform collection is not enabled.");
 connectProfile();z.object({workspaceId:z.string().uuid(),invoiceLineId:z.string().min(1),amountCents:z.number().int().positive().max(100000000),currency:z.string().regex(/^[a-z]{3}$/),customerId:z.string().regex(/^cus_[A-Za-z0-9]+$/),idempotencyKey:z.string().min(8).max(200),agreementVersion:z.string().min(1)}).parse(input);
 const reservation=await moneyRpc<{id:string}>("reserve_platform_collection",{p_business_id:input.workspaceId,p_line_id:input.invoiceLineId,p_amount:input.amountCents,p_currency:input.currency,p_customer_id:input.customerId,p_key:input.idempotencyKey,p_agreement:input.agreementVersion,p_installation_id:input.installationId??null},deps.db===undefined?connectDb():deps.db);
 // Customer is the confirmed paying party's platform-scoped customer, verified by SQL.
 return (deps.stripe??stripeClient()).paymentIntents.create({amount:input.amountCents,currency:input.currency,customer:input.customerId,metadata:{workspaceId:input.workspaceId,platformCollectionId:reservation.id,invoiceLineId:input.invoiceLineId,agreementVersion:input.agreementVersion}},{idempotencyKey:`platform-collection:${reservation.id}`});
}
