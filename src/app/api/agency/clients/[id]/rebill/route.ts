import { invoiceRequest } from "@/platform/agency-billing/http";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {return invoiceRequest(request,"rebill",(await params).id);}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {return invoiceRequest(request,"rebill",(await params).id);}
