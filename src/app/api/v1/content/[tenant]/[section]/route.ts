import { GET as publicContentGET } from "@/app/api/public/content/[tenant]/[section]/route";

export function GET(request: Request, context: { params: Promise<unknown> }) {
  return publicContentGET(
    request,
    context as { params: Promise<{ tenant: string; section: string }> }
  );
}
