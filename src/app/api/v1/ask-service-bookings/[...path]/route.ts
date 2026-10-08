import { z } from "zod";
import { limitPublicBookingRead } from "@/platform/bookings/public-read";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { createAskServicePublicBookingService, requireAskServiceManagement, publicBookingRangeSchema, publicBookingVisitorSchema, recoverPublicWebsiteBooking } from "@/products/scheduling/server";
import { bookingError, bookingJson, bookingOptions, bodyObject } from "../../bookings/_shared";
export const dynamic="force-dynamic";
const string=z.string().trim().min(1).max(256);
const reserve=z.object({capabilityId:string,capabilityVersion:z.number().int().positive(),slotId:string,visitor:publicBookingVisitorSchema,requestId:z.string().max(96).optional()}).strict();
const change=z.object({managementToken:string,capabilityId:string,capabilityVersion:z.number().int().positive(),slotId:string}).strict();
const manage=z.object({managementToken:z.string().trim().min(8).max(2048)}).strict();
type Context={params:Promise<{path:string[]}>};
async function handle(request:Request,context:Context) {
  const {path}=await context.params;
  if(path.length<4 || path.slice(0,3).join("/")!=="api/v1/bookings" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(path[3]!))return bookingJson({error:"This booking route is unavailable."},404);
  const tenantId=path[3]!; const tail=path.slice(4); const service=createAskServicePublicBookingService();
  try {
    if(request.method==="GET" && !tail.length) {
      await limitPublicBookingRead(request,tenantId);
      const url=new URL(request.url);const capabilityId=url.searchParams.get("capabilityId");
      if(!capabilityId || !/^ask-service-[a-f0-9]{32}$/.test(capabilityId))return bookingJson({error:"A new service capability is required."},400);
      const from=url.searchParams.get("from"),to=url.searchParams.get("to");
      const range=from||to?publicBookingRangeSchema.safeParse({from,to}):null;
      if(range && !range.success)return bookingJson({error:"Choose a booking range of up to sixty days."},400);
      return bookingJson(await service.read({tenantId,capabilityId,...(range?.success?{range:range.data}:{})}));
    }
    if(await isRateLimitedAsync(rateLimitKey(request,"ask-service-booking"),20))return bookingJson({error:"Too many booking requests."},429);
    const body=await bodyObject(request);
    if(request.method==="POST" && tail.join("/")==="reservations") {
      const parsed=reserve.safeParse(body);if(!parsed.success)return bookingJson({error:"Enter the service, time and visitor details."},400);
      return bookingJson(await service.reserve({tenantId,...parsed.data}),201);
    }
    if(tail[0]==="reservations" && tail.length>=2 && /^[A-Za-z0-9._~-]{8,2048}$/.test(tail[1]!)) {
      const reservationId=tail[1]!;
      if(request.method==="PATCH" && tail.length===2) {
        const parsed=change.safeParse(body);if(!parsed.success)return bookingJson({error:"The reservation change is incomplete."},400);
        await requireAskServiceManagement(tenantId,reservationId,parsed.data.managementToken);
        return bookingJson(await service.change({tenantId,reservationId,...parsed.data}));
      }
      const parsed=manage.safeParse(body);if(!parsed.success)return bookingJson({error:"The booking management token is required."},400);
      await requireAskServiceManagement(tenantId,reservationId,parsed.data.managementToken);
      if(request.method==="DELETE" && tail.length===2)return bookingJson(await service.cancel({tenantId,reservationId,...parsed.data}));
      if(request.method==="POST" && tail.length===3 && tail[2]==="readback")return bookingJson(await recoverPublicWebsiteBooking({tenantId,reservationId,...parsed.data}));
    }
    return bookingJson({error:"This booking route is unavailable."},404);
  } catch(error) {return bookingError(error);}
}
export const GET=handle,POST=handle,PATCH=handle,DELETE=handle;
export async function OPTIONS(){return bookingOptions();}
