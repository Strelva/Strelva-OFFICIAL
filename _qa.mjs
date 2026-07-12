import { chromium } from '@playwright/test';
const BASE='http://localhost:3001';
const SKIP=/delete|remove|archive|provision|send|scan all|publish|approve|dismiss|sign ?out|disconnect|\bpay\b|mint|deploy|connect google|reply on google|save reply|make live|use\b|post now|clear portfolio|reach out|draft (fixes|replies|these)/i;
const surfaces = process.argv.slice(2);
const b=await chromium.launch({channel:'chrome'});
const ctx=await b.newContext({viewport:{width:1400,height:1000}});
const pg=await ctx.newPage();
const routeCache=new Map();
async function checkLink(href){
  if(routeCache.has(href))return routeCache.get(href);
  const r=await pg.request.get(BASE+href).catch(()=>null);
  const s=r?r.status():0; routeCache.set(href,s); return s;
}
for(const url of surfaces){
  const errs=[],reqf=[];
  pg.removeAllListeners('console');pg.removeAllListeners('requestfailed');
  pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,70));});
  pg.on('requestfailed',r=>{const u=r.url();if(!u.includes('draft-reply'))reqf.push(u.replace(BASE,'').slice(0,40));});
  const resp=await pg.goto(BASE+url,{waitUntil:'networkidle',timeout:30000}).catch(e=>null);
  await pg.waitForTimeout(500);
  const problems=[];
  if(!resp||resp.status()>=400)problems.push('LOAD '+(resp?resp.status():'fail'));
  if(errs.length)problems.push('consoleErr:'+errs[0]);
  // links
  const links=[...new Set((await pg.$$eval('a[href]',els=>els.map(e=>e.getAttribute('href')))).filter(h=>h&&h.startsWith('/')&&!h.startsWith('/api')).map(h=>h.split('#')[0].split('?')[0]))];
  for(const h of links){const s=await checkLink(h);if(s>=400||s===0)problems.push(`deadlink ${h}:${s}`);}
  // stub text
  const stub=await pg.locator('text=/coming soon|not implemented|todo|undefined|NaN|\\[object/i').count().catch(()=>0);
  if(stub)problems.push('STUB/placeholder text');
  // click safe buttons
  const btns=await pg.$$('button:visible');
  let clicked=0;
  for(const bt of btns.slice(0,25)){
    const txt=(await bt.textContent().catch(()=>''))?.trim().slice(0,30)||'';
    if(!txt||SKIP.test(txt))continue;
    const preUrl=pg.url();const preErr=errs.length;
    await bt.click({timeout:2000}).catch(()=>{});
    await pg.waitForTimeout(250);
    clicked++;
    if(errs.length>preErr)problems.push(`btn "${txt}" -> consoleErr:${errs[errs.length-1]}`);
    // navigate back if it changed page
    if(pg.url()!==preUrl){await pg.goBack().catch(()=>{});await pg.waitForTimeout(300);}
  }
  console.log(`${url}  [clicked ${clicked} btns]${problems.length?'\n   ⚠ '+problems.join('\n   ⚠ '):'  ✓ clean'}`);
}
await b.close();
