import { GET as publicSiteCapabilitiesGET } from "@/app/api/public/site-capabilities/[tenant]/route";

export function GET(request: Request, context: { params: Promise<unknown> }) {
  return publicSiteCapabilitiesGET(
    request,
    context as { params: Promise<{ tenant: string }> }
  );
}
