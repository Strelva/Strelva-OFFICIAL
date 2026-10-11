// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WebsiteExperience } from "@/experience/websites/WebsiteExperience";
import { serverWebsiteTransport } from "@/experience/websites/contracts";
import { createWebsiteService, type WebsiteArtifactProvider } from "@/products/websites/server";
import type { WebsiteArtifact, WebsiteBrief, WebsiteLaunchReceipt } from "@/products/websites/contracts";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
let root: Root; let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); });
const brief: WebsiteBrief = {
  businessName: "Alder & Pine",
  description: "A neighborhood florist with seasonal arrangements.",
  audience: "People ordering flowers in the city.",
  primaryGoal: "Help visitors request an arrangement.",
  primaryCallToAction: "Request an arrangement",
  contactEmail: "hello@alderpine.example",
  notes: "Use a calm, welcoming tone.",
};

function artifact(revision: number, suffix = "a"): WebsiteArtifact {
  const contentHash = suffix.repeat(64);
  return {
    kind: "website_candidate",
    revision,
    spec: {
      version: 1,
      siteName: brief.businessName,
      content: { hero: { headline: brief.businessName } },
      pages: { home: { sections: [{ type: "hero", visible: true, order: 0 }] } },
      theme: { fontDisplay: "Instrument_Serif", fontBody: "Inter" },
    },
    contentHash,
    rendererDigest: "b".repeat(64),
    artifactDigest: "c".repeat(64),
    preview: { href: `/preview/websites/${revision}`, revision, contentHash },
    generatedAt: "2026-09-20T12:00:00.000Z",
  };
}

function providerFixture(options: { failGenerate?: boolean; launch?: WebsiteLaunchReceipt } = {}): WebsiteArtifactProvider & { generate: ReturnType<typeof vi.fn>; prepareLaunch: ReturnType<typeof vi.fn> } {
  return {
    generate: vi.fn(async ({ revision }: { revision: number }) => {
      if (options.failGenerate) throw new Error("provider unavailable");
      return artifact(revision, revision % 2 ? "a" : "b");
    }),
    prepareLaunch: vi.fn(async ({ candidate }: { candidate: WebsiteArtifact }): Promise<WebsiteLaunchReceipt> => options.launch ?? {
      status: "pending",
      receiptId: `receipt-${candidate.revision}`,
      provider: "local-artifact-provider",
      providerUrl: `https://provider.example/receipts/${candidate.revision}`,
      evidence: "Local provider prepared this exact artifact.",
      artifactHash: candidate.contentHash,
      candidateRevision: candidate.revision,
      preparedAt: "2026-09-20T12:01:00.000Z",
    }),
  };
}

it.each([{action:'revise',ack:'lost'}, {action:'revise',ack:'malformed'}, {action:'approve',ack:'lost'}, {action:'prepareLaunch',ack:'lost'}] as const)('freezes general $action after actual service commit and $ack acknowledgement', async ({action,ack}) => {
  const provider=providerFixture(); const service=createWebsiteService(memoryBoundedStore(),{provider});
  const created=await service.create(owner,'workspace-a',{requestId:'legacy-peer-probe-request',brief});
  const candidate=created.website.candidate!;
  const before=action==='approve' ? created : await service.approve(owner,created.workId,{expectedRevision:created.website.revision,candidateRevision:candidate.revision,candidateContentHash:candidate.contentHash});
  let posts=0;
  vi.stubGlobal('fetch',vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const path=String(input);
    if(path.includes('/connections')) return Response.json({tenants:[]});
    if(options?.method==='POST') {
      posts++; const {action: selected,...body}=JSON.parse(String(options.body));
      if(selected==='revise') await service.revise(owner,before.workId,body);
      else if(selected==='approve') await service.approve(owner,before.workId,body);
      else await service.prepareLaunch(owner,before.workId,body);
      if(ack==='lost') throw new TypeError('Lost response after commit');
      return Response.json({malformed:'after-commit'});
    }
    return Response.json(await service.read(owner,before.workId));
  }));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
  await act(async()=>root.render(createElement(WebsiteExperience,{workspaceId:'workspace-a',workId:before.workId,transport:serverWebsiteTransport})));
  const button=(label:string)=>[...container.querySelectorAll('button')].find(b=>b.textContent?.trim()===label);
  if(action==='revise') {
    const field=[...container.querySelectorAll('textarea')].find(f=>f.value===brief.description)!;
    await act(async()=> {Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(field,'Seasonal bouquets and weekday pickup.');field.dispatchEvent(new Event('input',{bubbles:true}));});
  }
  await act(async()=>button(action==='revise'?'Generate a new preview':action==='approve'?'Approve this preview':'Prepare launch')!.click());
  const saved=await service.read(owner,before.workId);
  expect(posts).toBe(1);expect(saved.website.revision).toBeGreaterThan(before.website.revision);
  if(action==='revise') {expect(saved.website.approvedCandidateRevision).toBeNull();expect(saved.website.brief.description).toBe('Seasonal bouquets and weekday pickup.');}
  if(action==='approve') expect(saved.website.approvedCandidateRevision).toBe(candidate.revision);
  if(action==='prepareLaunch') {expect(saved.website.launch.receipt).not.toBeNull();expect(provider.prepareLaunch).toHaveBeenCalledTimes(1);}
  expect(container.textContent).toContain('Check the current saved website');
  expect(button('Reload current state')).toBeDefined();
  expect(button('Generate a new preview')?.disabled).toBe(true);
});
