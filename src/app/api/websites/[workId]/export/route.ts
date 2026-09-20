import { websiteCandidateResponse } from "../../candidate-http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ workId: string }> }) {
  return websiteCandidateResponse(request, context.params, "export");
}
