"use client";
import { useCallback } from "react";
import { NativeFactMappings } from "@/experience/places/NativeFactMappings";

const workspaceId = "5e000000-0000-4000-8000-000000000010";
const sourceId = "5e000000-0000-4000-8000-000000000020";
const sites = [{ tenantId: "fictional-firm", siteName: "Example law firm website" }];

/** Fictional responses only. No requests reach a record, website or provider. */
export function BusinessFactMappingsPreview({ state }: { state: string }) {
  const request = useCallback<typeof fetch>(async (_url, options) => {
    if (state === "loading") await new Promise(resolve => setTimeout(resolve, 1800));
    if (state === "error") return Response.json({ error: "Website fact settings are temporarily unavailable." }, { status: 503 });
    if (options?.method === "POST") {
      if (state === "conflict") return Response.json({ error: "These website settings changed. Your choices are kept; reload to compare the latest settings." }, { status: 409 });
      const command = JSON.parse(String(options.body));
      return Response.json({ mapping: { ...command.mapping, revision: command.revision + 1 } });
    }
    return Response.json({ mapping: { revision: 1, fields: ["phone", "email", "address", "hours"], services: [] },
      businessServices: state === "empty" ? [] : [{ id: sourceId, name: "Initial consultation" }],
      nativeServices: state === "empty" ? [] : [{ id: "consultation-private", name: "Private consultation" }, { id: "follow-up", name: "Follow-up appointment" }] });
  }, [state]);
  return <main data-dashboard data-workspace-theme="linen" className="mx-auto min-h-screen max-w-3xl p-6"><h1 className="mb-4 text-lg font-medium">Website fact settings</h1><NativeFactMappings workspaceId={workspaceId} sites={state === "no_sites" ? [] : sites} readOnly={state === "read_only"} request={request} /></main>;
}
