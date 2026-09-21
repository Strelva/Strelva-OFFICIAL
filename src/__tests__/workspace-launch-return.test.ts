import { describe, expect, it } from "vitest";
import { workspaceReturnTarget, accountReturnTarget } from "@/lib/workspace-location";
const id="b9100000-0000-4000-8000-000000000001";
describe("launch route auth continuity",()=>{
 it.each([`/workspace/delivery/${id}`,`/workspace/delivery?businessId=${id}`,`/workspace/delivery?providerWorkspaceId=${id}`,"/workspace/delivery?providerKind=strelva", "/workspace/business/new?start=applications","/workspace/business/new?start=onboarding","/workspace/business/new?start=help",`/workspace?workspaceId=${id}&view=onboarding`])("preserves fixed supported destination %s",value=>{expect(workspaceReturnTarget(value)).toBe(value);expect(accountReturnTarget(`/account?next=${encodeURIComponent(value)}`)).toBe(`/account?next=${encodeURIComponent(value)}`);});
 it.each(["https://evil.example/workspace","//evil.example/workspace/delivery",`/workspace/delivery/${id}?redirect=https://evil.example`,`/workspace/delivery/${id}#token`, "/workspace/business/new?start=applications&start=help", "/workspace/business/new?start=delete",`/workspace/delivery?businessId=${id}&providerKind=strelva`,"/workspace/delivery?businessId=not-an-id","/workspace/delivery?providerKind=agency","/workspace/business/new?start=help#token","/workspace/business/new?next=https://evil.example"])('rejects %s',value=>expect(workspaceReturnTarget(value)).toBeNull());
});
