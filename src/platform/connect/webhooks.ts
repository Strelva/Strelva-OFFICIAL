import type Stripe from "stripe";
/** Signature and mode are verified before a thin event causes any provider read. */
export async function parseSignedConnectEvent(stripe:Stripe,body:string,signature:string,secrets:{snapshot?:string;thin?:string},live:boolean):Promise<Stripe.Event|null> {
 const shape=JSON.parse(body) as {object?:string};
 if(shape.object==="event") {if(!secrets.snapshot)throw Error("Snapshot secret missing");const event=stripe.webhooks.constructEvent(body,signature,secrets.snapshot);return event.livemode===live?event:null;}
 if(!secrets.thin)throw Error("Thin secret missing");
 const notice=stripe.parseEventNotification(body,signature,secrets.thin);
 if(notice.livemode!==live)return null;
 if(!notice.type.startsWith("v2.core.account.")||!("related_object" in notice))throw Error("Unsupported thin event");
 const related=notice.related_object;
 if(!related||!/^acct_[A-Za-z0-9]+$/.test(related.id)||related.url!==`/v2/core/accounts/${related.id}`)throw Error("Invalid account binding");
 const fetched=await notice.fetchEvent();
 if(fetched.id!==notice.id||fetched.type!==notice.type||fetched.livemode!==live||!("related_object" in fetched)||!fetched.related_object||typeof fetched.related_object!=="object"||!("id" in fetched.related_object)||fetched.related_object.id!==related.id)throw Error("Thin event binding mismatch");
 return {id:notice.id,type:notice.type,account:related.id,livemode:live,data:{object:{id:related.id}}} as unknown as Stripe.Event;
}
