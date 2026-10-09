import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({actor:vi.fn(),released:vi.fn(()=>true),command:vi.fn(),makeReal:vi.fn()}));
vi.mock("@/platform/workspace-release",()=>({workspaceReleaseEnabled:mocks.released}));
vi.mock("@/products/google-listing/native/server",()=>({commandNativeGoogle:mocks.command}));
vi.mock("@/app/api/workspace/systems/make-real/route",()=>({POST:mocks.makeReal}));
vi.mock("@/platform/workspaces/http",async()=>({...await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http"),workspaceHttpActor:mocks.actor}));
import {POST} from "@/app/api/workspace/publishing/google/route";
const origin="https://app.example.test",actor={userId:"owner",verifiedEmail:"owner@example.test"};
const request=(headers:Record<string,string>={},body:unknown={action:"read"})=>new Request(`${origin}/api/workspace/publishing/google`,{method:"POST",headers:{origin,"content-type":"application/json",...headers},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.released.mockReturnValue(true);mocks.actor.mockResolvedValue(actor);mocks.command.mockResolvedValue({ok:true});});
describe("native Google authenticated HTTP boundary",()=>{
 it("keeps release, same-origin JSON and actual session before every native command",async()=>{
  mocks.released.mockReturnValue(false);expect((await POST(request())).status).toBe(503);mocks.released.mockReturnValue(true);
  expect((await POST(request({origin:"https://foreign.example"}))).status).toBe(403);expect((await POST(request({"sec-fetch-site":"cross-site"}))).status).toBe(403);expect((await POST(request({"content-type":"text/plain"}))).status).toBe(415);
  mocks.actor.mockResolvedValue(null);expect((await POST(request())).status).toBe(401);expect(mocks.command).not.toHaveBeenCalled();
 });
 it("bounds the body and uses the current session actor",async()=>{
  expect((await POST(request({},"x".repeat(16001)))).status).toBe(413);expect(mocks.command).not.toHaveBeenCalled();
  const response=await POST(request({}, {action:"read_grant",workspaceId:"workspace",bindingId:"binding"}));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(mocks.command.mock.calls[0]![0]).toEqual(actor);
 });
 it("carries the exact reviewed plan to the real governed approval route",async()=>{
  const plan={workspaceId:"workspace",possibilityId:"proposal",candidateRevision:3,planFingerprint:"a".repeat(64)};
  mocks.makeReal.mockResolvedValue(new Response(JSON.stringify({status:"done"}),{status:200}));
  mocks.command.mockImplementation(async(_actor,_raw,makeReal)=>makeReal(plan));
  expect((await POST(request())).status).toBe(200);const forwarded=mocks.makeReal.mock.calls[0]![0] as Request;
  expect(forwarded.headers.get("origin")).toBe(origin);expect(await forwarded.json()).toEqual({workspaceId:plan.workspaceId,possibilityId:plan.possibilityId,expectedPlan:{candidateRevision:3,fingerprint:plan.planFingerprint}});
 });
});
