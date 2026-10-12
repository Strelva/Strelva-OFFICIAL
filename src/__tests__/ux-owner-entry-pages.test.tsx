import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({user:vi.fn(),workspaces:vi.fn(),history:vi.fn(),exited:vi.fn(),workspace:true,systems:vi.fn(),website:vi.fn()}));
vi.mock("@/platform/infra/db/server-client",()=>({getSessionUser:mock.user}));
vi.mock("@/platform/workspaces",()=>({listWorkspaces:mock.workspaces}));
vi.mock("@/platform/ask/history",()=>({createSupabaseAskHistory:()=>({read:mock.history})}));
vi.mock("@/platform/workspace-exit",()=>({readWorkspaceExitCompleted:mock.exited}));
vi.mock("@/platform/workspace-release",()=>({workspaceReleaseEnabled:()=>mock.workspace}));
vi.mock("@/platform/systems-release",()=>({systemsReleaseEnabledForWorkspace:mock.systems}));
vi.mock("@/products/websites/index",()=>({websiteRebuildReleasedFor:mock.website}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()}),notFound:()=>{throw new Error("notFound");},redirect:(href:string)=>{throw new Error(`redirect:${href}`);}}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("@/experience/app-frame/StrelvaShell",()=>({StrelvaShell:({children}:{children:React.ReactNode})=>createElement("div",null,children)}));
vi.mock("@/lib/invites",()=>({getInvite:async()=>null}));
vi.mock("@/server/agency-brand-entry",()=>({invitationEntryIdentity:async()=>null}));
import BookingAskPage from "@/app/workspace/business/new/booking/page";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
import WebsiteAskPage from "@/app/workspace/business/new/website/page";
import SignUpPage from "@/app/sign-up/[[...sign-up]]/page";
import { AiVisibilityResultView } from "@/products/ai-visibility/AiVisibilityResultView";
const workspaceId="ab200000-0000-4000-8000-000000000002";
const conversationId="ab200000-0000-4000-8000-000000000003";
const messageId="ab200000-0000-4000-8000-000000000004";
const actorId="ab200000-0000-4000-8000-000000000001";
const input={workspaceId,conversationId,messageId};
beforeEach(()=>{vi.clearAllMocks();mock.workspace=true;mock.user.mockResolvedValue({id:actorId,email:"owner@example.test",email_confirmed_at:"2026-10-12"});mock.workspaces.mockResolvedValue([{id:workspaceId,kind:"customer",access:"member",role:"owner",name:"Juniper"}]);mock.systems.mockResolvedValue(true);mock.website.mockResolvedValue(true);mock.exited.mockResolvedValue(false);mock.history.mockResolvedValue({mine:true,messages:[{id:messageId,role:"user",content:"Build a site with our opening hours"},{id:actorId,role:"user",content:"A later ask must not replace the original"}]});});
const renderPage=async()=>renderToStaticMarkup(await WebsiteAskPage({searchParams:Promise.resolve(input)}));
describe("owner entry pages",()=>{
 it("reads the exact authorized saved message before prefilling website creation",async()=>{const html=await renderPage();expect(html).toContain("Build a site with our opening hours");expect(html).not.toContain("A later ask");expect(html).toContain("Prepare a website with this ask");expect(mock.history).toHaveBeenCalledWith({userId:actorId,verifiedEmail:"owner@example.test"},{workspaceId,conversationId,limit:400});});
 it.each(["systems_off","website_off","stopped","exit_unknown","history_unavailable","not_mine","missing_message"])("withholds creation for %s",async state=>{if(state==="systems_off")mock.systems.mockResolvedValue(false);if(state==="website_off")mock.website.mockResolvedValue(false);if(state==="stopped")mock.exited.mockResolvedValue(true);if(state==="exit_unknown")mock.exited.mockRejectedValue(new Error("down"));if(state==="history_unavailable")mock.history.mockRejectedValue(new Error("down"));if(state==="not_mine")mock.history.mockResolvedValue({mine:false,messages:[]});if(state==="missing_message")mock.history.mockResolvedValue({mine:true,messages:[]});const html=await renderPage();expect(html).not.toContain("Prepare a website with this ask");expect(html).toContain("This website ask is unavailable");});
 it.each(["member","provider_seat","personal"])("refuses %s before reading private words",async kind=>{mock.workspaces.mockResolvedValue([{id:workspaceId,kind:kind==="personal"?"personal":"customer",access:kind==="provider_seat"?"provider_seat":"member",role:kind==="member"?"member":"owner"}]);await expect(renderPage()).rejects.toThrow("notFound");expect(mock.history).not.toHaveBeenCalled();});
 it("preserves only the bounded message destination through sign-in",async()=>{mock.user.mockResolvedValue(null);await expect(renderPage()).rejects.toThrow(`/sign-in?next=${encodeURIComponent(`/workspace/business/new/website?${new URLSearchParams(input)}`)}`);expect(mock.history).not.toHaveBeenCalled();});
 it("does not silently shorten an overlong saved ask at creation",async()=>{mock.history.mockResolvedValue({mine:true,messages:[{id:messageId,role:"user",content:"Build a new website "+"x".repeat(3000)}]});const html=await renderPage();expect(html).not.toContain("Prepare a website with this ask");expect(html).toContain("up to 3,000 characters");});
 it("keeps closed signup neutral and points to the public directory",async()=>{mock.workspace=false;const html=renderToStaticMarkup(await SignUpPage({searchParams:Promise.resolve({})}));expect(html).toContain('href="/audit"');expect(html).toContain('href="/agencies"');expect(html).toContain("Want it done for you? Find an agency");expect(html).not.toContain("Ask Strelva Agency");});
 it("starts a public check fix by choosing a business, carrying only the check identifier",()=>{const html=renderToStaticMarkup(createElement(AiVisibilityResultView,{result:{business:"Juniper",url:"https://example.test",score:75,grade:"C",verdict:"Readable",signals:[],citation:{probed:true,mentioned:true,recommended:false,note:"Named the business"},topFix:"Correct opening hours"},scanId:"scan_example",workspaceEnabled:true,shareUrl:null,onReset:()=>{}}));expect(html).toContain('href="/workspace/business/new?check=scan_example"');expect(html).toContain("Start with this fix");expect(html).not.toContain('/workspace?save=');});
});


describe("saved booking creation entry",()=>{
 it("opens native scheduling with the exact saved ask and no website-release dependency",async()=>{
  mock.website.mockResolvedValue(false);
  mock.history.mockResolvedValue({mine:true,messages:[{id:messageId,role:"user",content:"Add a booking page for consultations"}]});
  const html=renderToStaticMarkup(await BookingAskPage({searchParams:Promise.resolve(input)}));
  expect(html).toContain("Add a booking page for consultations");expect(html).toContain("Save availability");expect(html).not.toContain("Prepare a website");
  expect(mock.website).not.toHaveBeenCalled();
 });
 it.each(["stopped","exit_unknown","systems_off","not_mine"])("holds native creation for %s",async state=>{
  if(state==="stopped")mock.exited.mockResolvedValue(true);if(state==="exit_unknown")mock.exited.mockRejectedValue(new Error("down"));if(state==="systems_off")mock.systems.mockResolvedValue(false);if(state==="not_mine")mock.history.mockResolvedValue({mine:false,messages:[]});
  const html=renderToStaticMarkup(await BookingAskPage({searchParams:Promise.resolve(input)}));expect(html).toContain("This booking ask is unavailable");expect(html).not.toContain("Save availability");
 });
 it("keeps bounded saved-message identities through sign-in",()=>{
  const href=`/workspace/business/new/booking?${new URLSearchParams(input)}`;expect(workspaceReturnTarget(href)).toBe(href);expect(workspaceReturnTarget(`${href}&words=private`)).toBeNull();expect(workspaceReturnTarget(`${href}#private`)).toBeNull();
 });
});
