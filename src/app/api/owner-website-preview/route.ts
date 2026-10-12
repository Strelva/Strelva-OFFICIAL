import { ownerWebsitePreviewResponse } from "./preview";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  return ownerWebsitePreviewResponse(request);
}
