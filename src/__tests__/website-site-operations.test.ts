import { describe,it,expect,vi } from "vitest";
vi.mock("@/lib/ai-auto-approve", () => ({ maybeAutoApprove: async (_config: unknown,_section: unknown,decision: unknown) => decision }));
import { applySitePatch,prepareSitePatch,prepareSiteUndo,readSiteNodes } from "@/products/websites/site-operations";
import { siteDocumentSchema,siteDocumentHash } from "@/products/websites/site-document";
const fixture = () => siteDocumentSchema.parse({ version: 2,siteName:"The Mooney Firm",theme:{palette:"light",typeScale:"standard"},pages:[{path:"/",title:"The Mooney Firm",description:"",root:"hero"}],nodes:{hero:{id:"hero",type:"Hero",variant:"statement",props:{title:"Estate planning",body:"Plan ahead."},children:[],factIds:[]}},facts:{},assets:{},redirects:[],provenance:{composer:"rules"} });
describe("site document edits",()=>{
 it("applies detached RFC6902 operations and checks optimistic tests",()=>{ const doc=fixture(); const next=applySitePatch(doc,[{op:"test",path:"/nodes/hero/props/title",value:"Estate planning"},{op:"replace",path:"/nodes/hero/props/title",value:"Plan for your family"}]);expect(next.nodes.hero?.props).toMatchObject({title:"Plan for your family"});expect(doc.nodes.hero?.props).toMatchObject({title:"Estate planning"});expect(()=>applySitePatch(doc,[{op:"test",path:"/nodes/hero/props/title",value:"wrong"}])).toThrow("test failed"); });
 it("rejects prototype pollution, non-node writes, evidence changes, invalid catalog props and dangling roots",()=>{for(const op of [{op:"add",path:"/nodes/hero/props/__proto__/polluted",value:true},{op:"replace",path:"/theme/palette",value:"dark"},{op:"replace",path:"/nodes/hero/factIds",value:[]},{op:"replace",path:"/nodes/hero/props/title",value:3},{op:"remove",path:"/nodes/hero"}])expect(()=>applySitePatch(fixture(),[op])).toThrow();expect(({} as Record<string,unknown>).polluted).toBeUndefined(); });
 it("copy and move obey array pointer rules atomically",()=>{const doc=fixture();doc.nodes.hero!.children=[]; expect(()=>applySitePatch(doc,[{op:"move",from:"/nodes/hero/props",path:"/nodes/hero/props/title"}])).toThrow();expect(()=>applySitePatch(doc,[{op:"replace",path:"/nodes/hero/props/title",value:"Changed"},{op:"remove",path:"/nodes/missing"}])).toThrow(); expect(doc.nodes.hero?.props).toMatchObject({title:"Estate planning"});});
 it("keeps edits reviewed without server risk and force-reviews undo",async()=>{const result=await prepareSitePatch({document:fixture(),ops:[{op:"replace",path:"/nodes/hero/props/title",value:"Your next chapter"}],autoMode:true});expect(result.governance.action).toBe("review");expect(result.forceReview).toBe(true);const undo=prepareSiteUndo(fixture());expect(undo.forceReview).toBe(true);expect(undo.contentHash).toBe(siteDocumentHash(fixture()));});
 it("rejects verification laundering on whole-node replacement",()=>{const doc=fixture();expect(()=>applySitePatch(doc,[{op:"replace",path:"/nodes/hero",value:{...doc.nodes.hero,verification:{supported:true,confidence:1}}}])).toThrow("evidence");});
 it("turns changed copy into fresh owner-review facts, even when prior copy was confirmed",async()=>{const doc=fixture();const result=await prepareSitePatch({document:doc,ops:[{op:"replace",path:"/nodes/hero/props/title",value:"Guaranteed 100% results"}],forceReview:true});const node=result.document.nodes.hero!;expect(node.verification?.needsReview).toBe(true);expect(node.factIds.length).toBeGreaterThan(0);expect(Object.values(result.document.facts).some(fact=>fact.text==="Guaranteed 100% results"&&fact.highRisk&&fact.origin==="owner_stated")).toBe(true);});
 it("does not let force-review override a structural block",async()=>{const doc=fixture();doc.nodes.header={id:"header",type:"Header",variant:"logo-left",props:{brand:"Firm"},children:[],factIds:[]};const result=await prepareSitePatch({document:doc,ops:[{op:"replace",path:"/nodes/header/props/brand",value:"New firm"}],forceReview:true});expect(result.governance.action).toBe("block");});
 it("requires values for RFC6902 value operations and preserves structural governance across type changes",async()=>{const doc=fixture();expect(()=>applySitePatch(doc,[{op:"replace",path:"/nodes/hero/props/title"}])).toThrow();doc.nodes.header={id:"header",type:"Header",variant:"logo-left",props:{brand:"Firm"},children:[],factIds:[]};const result=await prepareSitePatch({document:doc,ops:[{op:"replace",path:"/nodes/header",value:{id:"header",type:"Hero",variant:"statement",props:{title:"Firm"},children:[],factIds:[]}}],forceReview:true});expect(result.governance.action).toBe("block");});
 it("adds catalog page roots and safe navigation together and exposes metadata as review facts",async()=>{
  const doc=fixture();doc.nodes.header={id:"header",type:"Header",variant:"logo-left",props:{brand:"Firm",links:[{label:"Home",href:"/"}]},children:[],factIds:[]};
  const result=await prepareSitePatch({document:doc,autoMode:true,risk:{level:"low",confidence:1},ops:[
   {op:"add",path:"/nodes/estate",value:{id:"estate",type:"Hero",variant:"statement",props:{title:"Estate planning"},children:[],factIds:[]}},
   {op:"add",path:"/pages/-",value:{path:"/estate-planning",title:"Estate planning",description:"We have 20 years of experience.",root:"estate"}},
   {op:"add",path:"/nodes/header/props/links/-",value:{label:"Estate planning",href:"/estate-planning"}},
  ]});
  expect(result.document.pages).toHaveLength(2);expect(result.governance.action).toBe("review");expect(result.forceReview).toBe(true);
  expect(result.document.nodes.estate!.verification?.needsReview).toBe(true);
  expect(result.document.nodes.estate!.factIds.some(id=>result.document.facts[id]!.text==="We have 20 years of experience."&&result.document.facts[id]!.highRisk&&result.document.facts[id]!.origin==="owner_stated")).toBe(true);
 });
 it("rejects reserved page paths, missing roots, page-budget overflow and writes outside pages/nodes",()=>{
  const doc=fixture();for(const path of ["/api/secret","/workspace","/privacy","/../escape"])expect(()=>applySitePatch(doc,[{op:"add",path:"/pages/-",value:{path,title:"Page",description:"",root:"hero"}}])).toThrow();
  expect(()=>applySitePatch(doc,[{op:"add",path:"/pages/-",value:{path:"/estate-planning",title:"Page",description:"",root:"missing"}}])).toThrow();
  expect(()=>applySitePatch(doc,Array.from({length:12},(_,i)=>({op:"add",path:"/pages/-",value:{path:`/page-${i}`,title:"Page",description:"",root:"hero"}})))).toThrow();
  for(const path of ["/facts/new","/assets/new","/capabilities","/theme","/provenance","/pages"])expect(()=>applySitePatch(doc,[{op:"add",path,value:{}}])).toThrow();
 });
 it("rejects a patch that expands a valid page past the render limit",()=>{
  const doc=fixture();let leafIndex=0;doc.nodes.hero!.children=["group0","group1","group2"];
  for(const [groupIndex,count] of [166,165,165].entries()){
   const children=Array.from({length:count},(_,index)=>`leaf${leafIndex+index}`);
   doc.nodes[`group${groupIndex}`]={id:`group${groupIndex}`,type:"Section",variant:"container",props:{},children,factIds:[]};
   for(const id of children)doc.nodes[id]={id,type:"Section",variant:"container",props:{title:"Leaf"},children:[],factIds:[]};
   leafIndex+=count;
  }
  expect(Object.keys(doc.nodes)).toHaveLength(500);
  expect(()=>applySitePatch(doc,[{op:"add",path:"/nodes/group0/children/-",value:"leaf0"}])).toThrow(/rendered sections/i);
 });
 it("cannot launder high-risk metadata through an already supported root",async()=>{
  const doc=fixture();doc.nodes.hero!.verification={supported:true,confidence:1};
  const result=await prepareSitePatch({document:doc,ops:[{op:"replace",path:"/pages/0/description",value:"Guaranteed 100% results"}]});
  expect(result.document.nodes.hero!.verification?.needsReview).toBe(true);expect(result.forceReview).toBe(true);
  const facts=result.document.nodes.hero!.factIds.map(id=>result.document.facts[id]!);expect(facts).toContainEqual(expect.objectContaining({text:"Guaranteed 100% results",origin:"owner_stated",highRisk:true}));
 });
 it("reads only the requested page graph",()=>{const doc=fixture();doc.nodes.other={...doc.nodes.hero!,id:"other"};expect(Object.keys(readSiteNodes(doc,"/").nodes)).toEqual(["hero"]);expect(()=>readSiteNodes(doc,"/missing")).toThrow();});
});
