import { describe, expect, it } from "vitest";
import { privateApplicationDefinition } from "@/experience/workspace/agency/private-definition-contracts";
const definition={kind:"internal_app",title:"Repair requests",fields:[{id:"problem",label:"Problem",type:"text",required:true}],components:[{kind:"form",fields:["problem"]}]};
describe("private application source boundary",()=>{
 it("retains the complete executable definition without mutating it",()=>expect(privateApplicationDefinition(definition)).toEqual(definition));
 it.each(["records","accounts","grants","maintenanceOwner","release"])("refuses source customer state %s",key=>expect(()=>privateApplicationDefinition({...definition,[key]:"Private sentinel"})).toThrow());
 it("refuses undeclared fields nested in a valid field",()=>expect(()=>privateApplicationDefinition({...definition,fields:[{...definition.fields[0],customerRecord:"Private sentinel"}]})).toThrow());
 it("refuses a form pointing to an unavailable field",()=>expect(()=>privateApplicationDefinition({...definition,components:[{kind:"form",fields:["missing"]}]})).toThrow());
});
