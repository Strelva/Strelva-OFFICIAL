import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PossibilityTry } from "@/experience/systems/PossibilityTry";
import { askServiceSetupTry, askServiceInquiryTry } from "@/products/scheduling/server";
export const dynamic="force-dynamic";
export default async function AskServiceSetupPreview() {
  if(!strelvaUiPreviewEnabled())notFound();
  const start=await fixtureStart();
  const selection={kind:"ask-new-service-setup",workspaceId:"45600000-0000-4000-8000-000000000010",setupId:"45600000-0000-4000-8000-000000000099",tenantStableId:"45600000-0000-4000-8000-000000000020",calendarConnectionId:"45600000-0000-4000-8000-000000000030",calendarUpdatedAt:"2026-10-08T12:00:00.000Z",businessRecordRevision:0,recordHours:null,inquiryRevision:null,inquiryStateHash:null,at:"2026-10-08T12:00:00.000Z",service:{kind:"new-booking-service",tenantId:"ask456-fixture",serviceName:"Consultation",durationMinutes:30,provider:"google",timeZone:"America/New_York",availability:[{start:start.toISOString(),end:new Date(start.getTime()+30*60000).toISOString()}]}};
  return <PossibilityTry state={{kind:"ready",view:{title:"Set up consultation requests",intent:"Let visitors tell you what they need and request one of the times you reviewed.",changes:[],introduces:["Consultation service, inquiry form and booking request page"],takesSubmissions:false,serviceSetup:{durationMinutes:30,schedule:askServiceSetupTry(selection),inquiry:askServiceInquiryTry(selection,"45600000-0000-4000-8000-000000000001")}}}} />;
}
async function fixtureStart(){const start=new Date(Date.now()+10*86400000);start.setUTCHours(14,0,0,0);return start;}
