// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {BundleNativeVersionPreview} from "@/experience/systems/BundleNativeVersionPreview";
const roots:ReturnType<typeof createRoot>[]=[];
beforeEach(()=>vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true));
afterEach(async()=>{for(const root of roots.splice(0))await act(async()=>root.unmount());document.body.innerHTML="";vi.unstubAllGlobals();});
async function render(state:string){const node=document.createElement("div");document.body.append(node);const root=createRoot(node);roots.push(root);await act(async()=>root.render(createElement(BundleNativeVersionPreview,{state})));return {node,root};}
const button=(node:HTMLElement,name:string)=>[...node.querySelectorAll("button")].find(b=>b.textContent===name)!;
describe("native Version review",()=>{
 it("requires a named overlap choice and links the actual business review without generic release",async()=>{
 const {node}=await render("conflict");await act(async()=>button(node,"Prepare this draft for release").click());expect(node.textContent).toContain("Nothing was staged or published");const stage=button(node,"Stage the chosen native draft");expect(stage.disabled).toBe(true);const choice=node.querySelector<HTMLSelectElement>("select")!;await act(async()=>{choice.value="local";choice.dispatchEvent(new Event("change",{bubbles:true}));});await act(async()=>stage.click());expect(node.textContent).toContain("native draft is ready");expect(node.textContent).not.toContain("release decision is in Needs you");expect(node.querySelector('a[href*="view=needs-you"]')?.getAttribute("href")).toContain("workspaceId=bb000000-0000-4000-8000-000000000011");expect(node.textContent).not.toContain("Make real");
 });
 it("shows native verification truth and clears staged choices when the scope becomes read-only",async()=>{
 const {node,root}=await render("ready");await act(async()=>button(node,"Prepare native draft for review").click());expect(node.querySelector('a[href*="view=needs-you"]')).not.toBeNull();await act(async()=>root.render(createElement(BundleNativeVersionPreview,{state:"readonly"})));expect(button(node,"Prepare this draft for release")).toBeUndefined();expect([...node.querySelectorAll("button")].some(b=>/Stage|Prepare native/.test(b.textContent??"")&&!b.disabled)).toBe(false);await act(async()=>root.render(createElement(BundleNativeVersionPreview,{state:"unverified"})));expect(node.textContent).toContain("current publication needs verification");expect(node.textContent).not.toContain("accepted publication verified");
 });
});
