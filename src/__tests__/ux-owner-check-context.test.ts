import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSetupCheck } from "@/app/workspace/business/new/check-context";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
const mocks=vi.hoisted(()=>({scan:vi.fn(),audit:vi.fn(),parse:vi.fn()}));
vi.mock("@/products/ai-visibility/server",()=>({getAiVisibilityResult:mocks.scan,parseAiVisibilityAssessmentPayload:mocks.parse}));
vi.mock("@/products/website-audit/server",()=>({getPublicWebsiteAudit:mocks.audit}));
beforeEach(()=>{vi.clearAllMocks();mocks.scan.mockResolvedValue({id:"scan_example",result:{}});mocks.parse.mockReturnValue({business:"Juniper",url:"https://example.test",topFix:"Correct opening hours"});});
describe("check to business continuity",()=>{
 it("uses saved evidence and first fix rather than user-written URL contents",async()=>{expect(await readSetupCheck("scan_example")).toEqual({businessName:"Juniper",request:"Start with this fix for Juniper: Correct opening hours\nWebsite: https://example.test\nSaved check: scan_example"});});
 it("refuses missing, corrupt or mismatched public results",async()=>{mocks.scan.mockResolvedValue({id:"scan_other",result:{}});expect(await readSetupCheck("scan_example")).toBeNull();expect(mocks.parse).not.toHaveBeenCalled();mocks.scan.mockResolvedValue({id:"scan_example",result:{}});mocks.parse.mockReturnValue(null);expect(await readSetupCheck("scan_example")).toBeNull();});
 it("selects the high-priority website fix and retains its report",async()=>{const id=`audit_${"a".repeat(32)}`;mocks.audit.mockResolvedValue({url:"https://example.test",categories:[{checks:[{name:"Other",message:"Minor",status:"warn",priority:"low"},{name:"Contact",message:"Missing phone",status:"fail",priority:"high"}]}]});expect((await readSetupCheck(id))?.request).toContain(`Contact. Missing phone\nWebsite: https://example.test\nSaved check: ${id}`);});
 it("rejects invalid identifiers before reading either store",async()=>{expect(await readSetupCheck("https://evil.test")).toBeNull();expect(mocks.scan).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled();});
 it("retains the source URL and check identity when a report's recommendation is long",async()=>{mocks.parse.mockReturnValue({business:"Juniper",url:"https://example.test",topFix:"Long recommendation. ".repeat(300)});const result=await readSetupCheck("scan_example");expect(result?.request.length).toBeLessThanOrEqual(3000);expect(result?.request).toContain("…\nWebsite: https://example.test\nSaved check: scan_example");});
 it.each(["/workspace/business/new?check=scan_example",`/workspace/business/new?start=help&check=audit_${"a".repeat(32)}`])("preserves check context through sign-in: %s",href=>expect(workspaceReturnTarget(href)).toBe(href));
 it.each(["/workspace/business/new?check=scan_example&check=scan_other","/workspace/business/new?check=invalid","/workspace/business/new?check=scan_example&request=words","/workspace/business/new?check=scan_example#secret"])("refuses expanded auth return %s",href=>expect(workspaceReturnTarget(href)).toBeNull());
});
