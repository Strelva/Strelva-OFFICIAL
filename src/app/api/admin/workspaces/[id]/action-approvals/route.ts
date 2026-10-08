import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedOperatorContext } from "@/platform/infra/auth";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { operatorApprovalRequestSchema, recordOperatorActionApproval } from "@/platform/workspaces/operator-approvals";

const noStore = { "Cache-Control": "private, no-store" };

/** Records a scoped approval from the current operator; the approver is never accepted from the body. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await getAuthenticatedOperatorContext();
  if (!operator) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  try {
    const { id: workspaceId } = await params;
    const input = operatorApprovalRequestSchema.parse(await request.json().catch(() => null));
    const approval = await recordOperatorActionApproval(operator.actor, workspaceId, input);
    return NextResponse.json({ approval }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: "Only an active Strelva operator can record an approval." }, { status: 403, headers: noStore });
    if (error instanceof WorkspaceConflictError) return NextResponse.json({ error: error.message }, { status: 409, headers: noStore });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the action details and try again." }, { status: 400, headers: noStore });
    if (error instanceof WorkspaceStoreError) return NextResponse.json({ error: error.message }, { status: 503, headers: noStore });
    console.error("[operator-approvals] approval route failed", error);
    return NextResponse.json({ error: "The approval could not be recorded." }, { status: 503, headers: noStore });
  }
}
