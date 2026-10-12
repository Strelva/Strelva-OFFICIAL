"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceInquirySystem } from "@/experience/places/WorkspaceInquirySystem";

/** Isolated fixture for observing in-flight reads across a business switch. */
export function InquirySystemSwitchPreview() {
  const [workspaceId, setWorkspaceId] = useState("5e000000-0000-4000-8000-000000000010");
  return <><nav aria-label="Fixture businesses" className="flex flex-wrap gap-3 p-6"><Button variant="secondary" onClick={() => setWorkspaceId("5e000000-0000-4000-8000-000000000010")}>Open Juniper</Button><Button variant="secondary" onClick={() => setWorkspaceId("5e000000-0000-4000-8000-000000000011")}>Open Maple</Button></nav><WorkspaceInquirySystem workspaceId={workspaceId} /></>;
}
