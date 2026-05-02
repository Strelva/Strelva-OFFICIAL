import { GET as publicPageConfigGET } from "@/app/api/public/page-config/[tenant]/route";

export function GET(request: Request, context: { params: Promise<unknown> }) {
  return publicPageConfigGET(request, context as { params: Promise<{ tenant: string }> });
}
