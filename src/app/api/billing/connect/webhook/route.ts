import {ingestRevenueEvent} from "@/platform/connect/revenue";
import {connectEnabled,stripeClient,ingestConnectEvent} from "@/platform/connect";
import {parseSignedConnectEvent} from "@/platform/connect/webhooks";
import {readBoundedBody} from "@/platform/workspaces/http";
export async function POST(request:Request) {
 if(!connectEnabled()||(!process.env.STRIPE_CONNECT_WEBHOOK_SECRET&&!process.env.STRIPE_CONNECT_THIN_WEBHOOK_SECRET))return Response.json({error:"Connect webhook is not enabled."},{status:503});
 let event; try {event=await parseSignedConnectEvent(stripeClient(),(await readBoundedBody(request,500000)).toString("utf8"),request.headers.get("stripe-signature")??"",{snapshot:process.env.STRIPE_CONNECT_WEBHOOK_SECRET,thin:process.env.STRIPE_CONNECT_THIN_WEBHOOK_SECRET},process.env.STRIPE_SECRET_KEY?.startsWith("sk_live")===true);}catch{return Response.json({error:"Invalid signed webhook."},{status:400});}
 if(!event)return Response.json({ignored:"mode-mismatch"});
 try{await ingestRevenueEvent(event);return Response.json(await ingestConnectEvent(event));}catch{return Response.json({error:"Connect event could not be recorded."},{status:503});}
}
