import { invoiceRequest } from "@/platform/agency-billing/http";
export const dynamic="force-dynamic";
export async function POST(request:Request){return invoiceRequest(request,"pay_link");}
export async function GET(request:Request){return invoiceRequest(request,"pay_link");}
