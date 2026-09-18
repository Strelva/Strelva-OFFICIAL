import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { buildCustomApplication, customArtifactDigest } from "../src/products/custom-applications/server";

async function main() {
  const reference = { workspaceId: "11111111-1111-4111-8111-111111111111", resourceId: "22222222-2222-4222-8222-222222222222", applicationVersion: 1 };
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Shift coverage</title><style>body{font:16px system-ui;max-width:40rem;margin:2rem auto;padding:1rem}label,input,button{display:block;margin:1rem 0}input,button{font:inherit;padding:.75rem}output{display:block;margin-top:1rem}</style><main><h1>Shift coverage</h1><p>Compare available staff hours with the hours this shift needs.</p><form><label>Available hours<input name="available" type="number" min="0" value="24" required></label><label>Required hours<input name="required" type="number" min="0" value="32" required></label><button>Check coverage</button></form><output aria-live="polite"></output></main><script>document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget);const gap=Number(data.get('required'))-Number(data.get('available'));document.querySelector('output').textContent=gap>0?gap+' more staff hours needed':'This shift has enough staff hours';});</script></html>`;
  const artifact = await buildCustomApplication({ ...reference, files: {
    "build.mjs": `import {writeFile} from 'node:fs/promises'; await writeFile('/output/index.html',${JSON.stringify(html)});`,
  } });
  assert.equal(artifact.html, html);
  assert.equal(artifact.artifactDigest, customArtifactDigest(artifact));
  assert.equal(artifact.state, "built");
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.route("**/*", route => route.abort());
      await page.setContent(artifact.html);
      await page.getByRole("button", { name: "Check coverage" }).click();
      assert.equal(await page.locator("output").textContent(), "8 more staff hours needed");
      await page.getByLabel("Available hours").fill("40");
      await page.getByLabel("Available hours").press("Enter");
      assert.equal(await page.locator("output").textContent(), "This shift has enough staff hours");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const defended = await buildCustomApplication({ ...reference, files: {
    "build.mjs": `import {writeFile,readFile} from 'node:fs/promises';
import {connect} from 'node:net';
if(process.env.STRELVA_BUILD_TEST_SECRET)throw new Error('host environment leaked');
for(const target of ['/source/build.mjs','/etc/strelva-test']){let denied=false;try{await writeFile(target,'escape')}catch{denied=true}if(!denied)throw new Error('unexpected write');}
let readDenied=false;try{await readFile('/source/../.env.local')}catch{readDenied=true}if(!readDenied)throw new Error('unexpected read');
const blocked=await new Promise(resolve=>{const socket=connect({host:'198.51.100.1',port:80});socket.setTimeout(1000);socket.on('connect',()=>{socket.destroy();resolve(false)});socket.on('error',()=>resolve(true));socket.on('timeout',()=>{socket.destroy();resolve(true)});});
if(!blocked)throw new Error('network available');
await writeFile('/output/index.html','<!doctype html><title>Isolation checked</title>');`,
  } });
  assert.match(defended.html, /Isolation checked/);
  await assert.rejects(buildCustomApplication({ ...reference, files: { "build.mjs": "import {symlink} from 'node:fs/promises'; await symlink('/etc/passwd','/output/index.html');" } }), /build failed/);
  await assert.rejects(buildCustomApplication({ ...reference, files: { "build.mjs": "import {writeFile} from 'node:fs/promises'; await writeFile('/output/index.html','x'.repeat(600000));" } }), /build failed/);
  console.log("Custom application build passed: exact artifact, desktop/mobile calculation and keyboard use, no network or host environment, read-only source/root, rejected symlink and oversized output. This is local construction proof, not deployment.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Custom build check failed"); process.exitCode = 1; });
