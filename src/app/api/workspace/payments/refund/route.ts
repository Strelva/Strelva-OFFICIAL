import {z} from "zod";
import {createDirectRefund} from "@/platform/connect/refunds";
import {workspaceHttpActor,workspaceWriteGuard,readWorkspaceBody,workspaceJson,workspaceHttpFailure} from "@/platform/workspaces/http";
import {isRateLimitedWindowedAsync} from "@/platform/infra/rate-limit";
export async function POST(request:Request){const guard=workspaceWriteGuard(request);if(guard)return guard;try{const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Sign in."},401);if(await isRateLimitedWindowedAsync(`refund:${actor.userId}`,10,60000))return workspaceJson({error:"Please wait."},429);const input=z.object({workspaceId:z.string().uuid(),paymentId:z.string().uuid(),amountCents:z.number().int().positive().max(100000000),idempotencyKey:z.string().min(8).max(200)}).strict().parse(await readWorkspaceBody(request,8000));return workspaceJson(await createDirectRefund(actor,input));}catch(error){return workspaceHttpFailure(error);}}
