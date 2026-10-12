"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceOngoing } from "../WorkspaceOngoing";
export function InquiryRunningPreview() {
  const [workspaceId, setWorkspaceId] = useState("5e000000-0000-4000-8000-000000000010");
  return <><nav aria-label="Fixture businesses" className="flex gap-3 p-6"><Button variant="secondary" onClick={() => setWorkspaceId("5e000000-0000-4000-8000-000000000010")}>Open Juniper</Button><Button variant="secondary" onClick={() => setWorkspaceId("5e000000-0000-4000-8000-000000000011")}>Open Maple</Button></nav><WorkspaceOngoing workspaceId={workspaceId} sources={[]} selectedWork={null} selectedStandingId={null} selectedAssignmentId={null} creatingStanding={false} readOnly inquiriesEnabled onCreatingStandingChange={() => undefined} onOpenStanding={() => undefined} onSaved={() => undefined} /></>;
}
