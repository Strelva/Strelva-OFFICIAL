/** Socket-only, task-owned SQL adapter. Never accepts an ambient database. */
import { sql, requireLocal } from "../../../scripts/release-safety/postgres";
import { readFileSync } from "node:fs";
const quote=(value:unknown):string=>value===null?"null":typeof value==="object"?`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`:`'${String(value).replaceAll("'","''")}'`;
const id=(value:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(value))throw new Error("Invalid fixture identifier");return `"${value}"`;};
export function taskPostgres(url:string) {
  requireLocal(url); if(!new URL(url).searchParams.get("host")?.includes("strelva-release-safety-"))throw new Error("An owned fixture socket is required.");
  const execute=(query:string)=>JSON.parse(sql(url,{text:query})||"null");
  return {execute, rpc:async(name:string,args:Record<string,unknown>)=>{
    try {const call=`public.${id(name)}(${Object.entries(args).map(([key,value])=>`${id(key)}=>${quote(value)}`).join(",")})`;
      const set=execute(`select to_jsonb(bool_or(proretset)) from pg_proc where proname=${quote(name)}`);
      return {data:execute(set?`select coalesce(jsonb_agg(to_jsonb(r)),'[]') from ${call} r`:`select to_jsonb(${call})`),error:null};
    } catch(error){const message=error instanceof Error?error.message:"Fixture SQL failed";
      const path=message.match(/private diagnostics: (.*)$/)?.[1];
      const detail=path?readFileSync(path,"utf8").match(/ERROR:([^\n]*)/)?.[1]?.trim():message;
      console.error("Owned fixture RPC refusal",name,detail);
      return {data:null,error:{message:detail??message}};}
  },from:(table:string)=>{
    const filters:string[]=[];let singleton=false;let limit=1000;let mutation:Record<string,unknown>|null=null;let operation="";
    const run=async()=>{try {
      const where=filters.length?` where ${filters.join(" and ")}`:"";
      let source=`select * from public.${id(table)}${where} limit ${limit}`;
      if(mutation){const columns=Object.keys(mutation);const vals=columns.map(key=>`r.${id(key)}`).join(",");
        const record=`jsonb_populate_record(null::public.${id(table)},${quote(mutation)}) r`;
        source=operation==="update"?`update public.${id(table)} set ${columns.map(key=>`${id(key)}=${quote(mutation![key])}`).join(",")}${where} returning *`
          :`insert into public.${id(table)} (${columns.map(id).join(",")}) select ${vals} from ${record}${operation==="upsert"?` on conflict(id) do update set ${columns.filter(k=>k!=="id").map(k=>`${id(k)}=excluded.${id(k)}`).join(",")}`:""} returning *`;
      }
      const rows=execute(`with rows as (${source}) select coalesce(jsonb_agg(to_jsonb(rows)),'[]') from rows`) as unknown[];
      return {data:singleton?rows[0]??null:rows,error:null};
    }catch(error){return {data:null,error:{message:error instanceof Error?error.message:"Fixture SQL failed"}};}};
    const query={select:()=>query,eq:(key:string,value:unknown)=>{filters.push(`${id(key)}=${quote(value)}`);return query;},limit:(value:number)=>{limit=value;return query;},
      order:()=>query,insert:(value:Record<string,unknown>)=>{mutation=value;operation="insert";return query;},update:(value:Record<string,unknown>)=>{mutation=value;operation="update";return query;},
      upsert:(value:Record<string,unknown>)=>{mutation=value;operation="upsert";return query;},maybeSingle:()=>{singleton=true;return run();},single:()=>{singleton=true;return run();},then:<T>(resolve:(value:Awaited<ReturnType<typeof run>>)=>T,reject?:(error:unknown)=>T)=>run().then(resolve,reject)};
    return query;
  }};
}
