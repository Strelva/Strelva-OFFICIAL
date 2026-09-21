import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { buildCustomApplication, customArtifactDigest } from "../src/products/custom-applications/server";
import { CUSTOM_APPLICATION_PARENT_CSP, customApplicationSandboxHtml } from "../src/products/custom-applications/client";

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Navigation proof server did not expose a port");
  return address.port;
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

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
      // Keep the interaction fixture deterministic. This route abort is not
      // used as the navigation proof; the direct/meta-refresh check below
      // uses an unmocked loopback target and counts its received requests.
      await page.route("**/*", route => route.abort());
      await page.setContent(`<meta http-equiv="Content-Security-Policy" content="${CUSTOM_APPLICATION_PARENT_CSP}"><iframe title="released artifact" sandbox="allow-scripts allow-forms" style="width:100%;height:100%;border:0"></iframe>`);
      await page.locator("iframe").evaluate((frame, html) => frame.setAttribute("srcdoc", html), customApplicationSandboxHtml(artifact.html));
      const artifactFrame = page.frameLocator("iframe");
      await artifactFrame.getByRole("button", { name: "Check coverage" }).click();
      assert.equal(await artifactFrame.locator("output").textContent(), "8 more staff hours needed");
      await artifactFrame.getByLabel("Available hours").fill("40");
      await artifactFrame.getByLabel("Available hours").press("Enter");
      assert.equal(await artifactFrame.locator("output").textContent(), "This shift has enough staff hours");
      assert.equal(await artifactFrame.locator("html").evaluate(element => element.scrollWidth <= (element.ownerDocument.defaultView?.innerWidth ?? 0)), true);
      const navigationAttempts: string[] = [];
      const policyBlockedResponses: string[] = [];
      const policyMessages: string[] = [];
      page.on("request", request => {
        if (request.url().includes("/escape")) navigationAttempts.push(request.url());
      });
      page.on("response", response => {
        if (response.url().includes("custom-application-navigation.invalid")) policyBlockedResponses.push(response.url());
      });
      page.on("console", message => {
        if (message.text().includes("violates the following Content Security Policy directive")) policyMessages.push(message.text());
      });
      await artifactFrame.locator("body").evaluate(body => {
        const link = body.ownerDocument.createElement("a");
        link.href = "https://custom-application-navigation.invalid/escape";
        link.textContent = "external navigation";
        body.append(link);
        link.click();
      });
      await page.waitForTimeout(100);
      assert.deepEqual(navigationAttempts, []);
      await artifactFrame.locator("body").evaluate(body => {
        const script = body.ownerDocument.createElement("script");
        script.src = "https://custom-application-navigation.invalid/external.js";
        body.append(script);
      });
      await artifactFrame.locator("body").evaluate(async () => {
        try { await fetch("https://custom-application-navigation.invalid/data"); } catch { /* CSP denies the request. */ }
      });
      await page.waitForTimeout(100);
      assert.deepEqual(policyBlockedResponses, []);
      assert.ok(policyMessages.length >= 2);
      await page.close();
    }

    const targetRequests: string[] = [];
    const targetServer = createServer((request, response) => {
      if (request.url) targetRequests.push(request.url);
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<main>Unexpected external target ${request.url ?? ""}</main>`);
    });
    const targetPort = await listen(targetServer);
    const parentServer = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<meta http-equiv="Content-Security-Policy" content="${CUSTOM_APPLICATION_PARENT_CSP}"><main><p>Custom application parent</p><iframe title="released artifact" sandbox="allow-scripts allow-forms" style="width:100%;height:100%;border:0"></iframe></main>`);
    });
    const parentPort = await listen(parentServer);
    try {
      async function openNavigationParent() {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${parentPort}/parent`);
        await page.locator("iframe").evaluate((frame, source) => frame.setAttribute("srcdoc", source), customApplicationSandboxHtml(artifact.html));
        const frame = page.frameLocator("iframe");
        await frame.getByRole("button", { name: "Check coverage" }).click();
        assert.equal(await frame.locator("output").textContent(), "8 more staff hours needed");
        return page;
      }

      targetRequests.length = 0;
      const directPage = await openNavigationParent();
      const directUrl = `http://127.0.0.1:${targetPort}/direct-location`;
      await directPage.frameLocator("iframe").locator("body").evaluate((body, url) => {
        const view = body.ownerDocument.defaultView;
        if (view) view.location.href = url;
      }, directUrl);
      await directPage.waitForTimeout(300);
      assert.deepEqual(targetRequests, []);
      assert.equal(directPage.url(), `http://127.0.0.1:${parentPort}/parent`);
      assert.notEqual(directPage.frames().find(frame => frame !== directPage.mainFrame())?.url(), directUrl);
      await directPage.close();

      targetRequests.length = 0;
      const refreshPage = await openNavigationParent();
      const refreshUrl = `http://127.0.0.1:${targetPort}/meta-refresh`;
      await refreshPage.frameLocator("iframe").locator("head").evaluate((head, url) => {
        const refresh = head.ownerDocument.createElement("meta");
        refresh.httpEquiv = "refresh";
        refresh.content = `0;url=${url}`;
        head.append(refresh);
      }, refreshUrl);
      await refreshPage.waitForTimeout(300);
      assert.deepEqual(targetRequests, []);
      assert.equal(refreshPage.url(), `http://127.0.0.1:${parentPort}/parent`);
      assert.notEqual(refreshPage.frames().find(frame => frame !== refreshPage.mainFrame())?.url(), refreshUrl);
      await refreshPage.close();
    } finally {
      await close(parentServer);
      await close(targetServer);
    }

    const earlyScriptPage = await browser.newPage();
    try {
      await earlyScriptPage.setContent('<iframe title="early script" sandbox="allow-scripts allow-forms"></iframe>');
      await earlyScriptPage.locator("iframe").evaluate((frame, source) => frame.setAttribute("srcdoc", source), customApplicationSandboxHtml("<script>document.body.dataset.early='yes'</script><main>Early artifact</main>"));
      assert.equal(await earlyScriptPage.frameLocator("iframe").locator("body").getAttribute("data-early"), "yes");
    } finally {
      await earlyScriptPage.close();
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
  console.log("Custom application build passed: exact artifact, desktop/mobile calculation and keyboard use, restricted build network and host environment, blocked preview links/code/fetch, parent-CSP-protected direct location and meta-refresh attempts with no target requests, read-only source/root, rejected symlink and oversized output. This is local construction proof, not deployment.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Custom build check failed"); process.exitCode = 1; });
