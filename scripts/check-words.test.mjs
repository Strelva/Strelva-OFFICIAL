import assert from "node:assert/strict";
import { test } from "node:test";
import { screenWordProblems } from "./check-words.mjs";
const filename = "src/experience/workspace/WordsFixture.tsx";
const check = source => screenWordProblems(source, filename);

test("finds retired screen copy in JSX, attributes, strings and template fragments", () => {
  const source = 'const hint = "Custom application unavailable"; const other = `Your dashboard: ${name} — Provider change`; const screen = <section><h2>Strelva handled</h2><input placeholder="Choose a saved investigation" /></section>;';
  assert.deepEqual(check(source).map(hit => hit.word), ["Custom application", "Your dashboard", "Provider change", "Strelva handled", "saved investigation"]);
});
test("ignores comments, paths, identifiers, contract enums and tests", () => {
  assert.deepEqual(check('// Strelva handled\n/* Custom application */\nconst capability = "capability"; const type = { outcome: "Capability" }; type Kind = "Private app"; import app from "./Private app"; const path = "/dashboard"; const x = <div className="capability"/>;'), []);
  assert.deepEqual(screenWordProblems('const title = "Private app";', "src/__tests__/words.tsx"), []);
  assert.deepEqual(screenWordProblems('const title = "Private app";', "src/app/dashboard/page.tsx"), []);
  assert.deepEqual(screenWordProblems('const title = "Private app";', "src/migrations/old.ts"), []);
});
test("allows a real same-line or preceding comment only for its named word", () => {
  assert.deepEqual(check('// words-allow: Private app -- Quote from imported customer text.\nconst title = "Private app";'), []);
  assert.deepEqual(check('const title = "Private app"; // words-allow: Private app -- Quote from imported customer text.'), []);
  assert.equal(check('// words-allow: Private app --\nconst title = "Private app";').length, 1);
  assert.equal(check('const fake = "// words-allow: Private app -- fake reason"; const title = "Private app";').length, 2);
  assert.equal(check('// words-allow: Private app -- Quote from imported customer text.\nconst title = "Private app and Custom application";')[0].word, "Custom application");
});
test("Reservations retires the kind/title while held reservations remain valid", () => {
  assert.equal(check('const title = "Reservations";')[0].word, "Reservations");
  assert.deepEqual(check('const message = "Reservations are held here first.";'), []);
  assert.equal(check('const screen = <h2>Reservations for this business</h2>;')[0].word, "Reservations");
  assert.deepEqual(check('const screen = <p>Reservations are held here first.</p>;'), []);
  assert.deepEqual(check('const copy = { summary: "Reservations are held here first." };'), []);
  assert.deepEqual(check('const screen = <StSkeleton label="Loading reservations" />;'), []);
});
test("capability is forbidden on business screens but allowed in operator diagnostics", () => {
  assert.equal(check('const screen = <h2>Capability</h2>;')[0].word, "capability");
  assert.deepEqual(screenWordProblems('const title = "Capability";', "src/app/admin/page.tsx"), []);
  assert.deepEqual(screenWordProblems('throw new Error("Capability schema is invalid");', "src/products/inquiries/engine.ts"), []);
});
test("reports the actual line for multiline JSX and template copy", () => {
  const hits = check('const screen = <div>\n  Provider handoff\n</div>;\nconst text = `Hello\nCustom application`;');
  assert.deepEqual(hits.map(hit => hit.line), [2, 5]);
});


test("does not miss retired phrases split across JSX whitespace", () => {
  assert.equal(check('const screen = <h2>Strelva\n  handled</h2>;')[0].word, "Strelva handled");
});
test("checks lowercase display property values without treating wire enums as copy", () => {
  assert.equal(check('const screen = { title: "capability" };')[0].word, "capability");
  assert.deepEqual(check('const contract = { kind: "capability", resourceKind: "application" };'), []);
});

test("allows an internal prompt array entry without swallowing its preceding comment as literal trivia", () => {
  assert.deepEqual(check('const prompt = [\n  "Plan only.",\n  // words-allow: Private app -- Internal planning schema, never screen copy.\n  "Infer a private app from the request.",\n];'), []);
  assert.equal(check('const prompt = [\n  "Plan only.",\n  // words-allow: Private app -- Internal planning schema, never screen copy.\n  "Infer a private app and Custom application.",\n];')[0].word, "Custom application");
});

test("Ready-made is retired; Apps names reusable Systems while Private app stays retired", () => {
  assert.equal(check('const screen = <h2>Ready-made systems</h2>;')[0].word, "Ready-made");
  assert.equal(check('const back = "Back to ready-made systems";')[0].word, "Ready-made");
  assert.deepEqual(check('const screen = <h2>Apps from creators</h2>; const label = { title: "Apps" };'), []);
  assert.equal(check('const title = "Private app";')[0].word, "Private app");
});

test("Make real remains a concept but never a button label", () => {
  assert.deepEqual(check('const screen = <section><h2>Make real</h2><p>Make real turns a Possibility on.</p></section>;'), []);
  for (const source of [
    'const screen = <button>Make real</button>;',
    'const screen = <StPill><span>Make real</span></StPill>;',
    'const action = "Make real"; const screen = <StPill>{action}</StPill>;',
    'const action = "Make real"; const screen = <StHold label={action} />;',
    'const screen = <StPill>{retry ? "Retry Make real" : "Make real"}</StPill>;',
    'const screen = <StHold label="Make real" />;',
    'const labels = { makeReal: "Make real" };',
  ]) assert.ok(check(source).some(hit => hit.word === "Make real (button)"));
  assert.deepEqual(check('const screen = <StPill>Make it live</StPill>; const hold = <StHold label="Hold to make it live" />;'), []);
  assert.deepEqual(check('const screen = <StHold label="Hold to confirm" />; const send = <StPill>Send to Harbor Dental</StPill>;'), []);
  assert.equal(check('const screen = <StHold label="Hold to publish" />;')[0].word, "Hold to publish");
  assert.equal(check('const screen = <StHold label={busy ? "Saving…" : "Hold to approve"} />;')[0].word, "Hold to approve");
});

test("retires conflicting approval, source and list copy", () => {
  assert.deepEqual(check('const screen = <section><Button>Approve and publish</Button><h2>Source revisions</h2><p>Filed for Strelva: a page</p><a>All files and results</a></section>;').map(hit => hit.word), ["Approve and publish", "Source revisions", "Filed for Strelva", "All files and results"]);
});

test("finds literal, interpolated and JSX short release labels without renaming IDs", () => {
  for (const source of [
    'const screen = <StMono>r12</StMono>;',
    'const copy = { revision: "r12+1", label: "Library r12" };',
    'const screen = <StSection title={`Package r${revision}`} />;',
    'const screen = <StMono>r{revision}</StMono>;',
    'const title = `From Library r${revision}`;',
  ]) assert.ok(check(source).some(hit => hit.word === "r-number revision label"));
  assert.ok(check('const title = `Package r${revision}`;').some(hit => hit.word === "Package r"));
  assert.deepEqual(check('const screen = <StMono>Release 12 + 1 local change</StMono>; const title = `Release ${revision} draft`;'), []);
  assert.deepEqual(check('const record = { id: "r12", requestId: "r12", revisionId: "r12" }; type Revision = "r12"; const path = "/releases/r12"; const screen = <div data-id="r12" />;'), []);
  assert.deepEqual(check('const record = { recordId: `r${number}`, sourceRevisionId: "r12" }; const screen = <div className={"r12"} data-id={`r${number}`} />;'), []);
  assert.deepEqual(screenWordProblems('const tag = `candidate-r${revision}`;', "src/app/api/websites/candidate-http.ts"), []);
  assert.deepEqual(screenWordProblems('const suffixes = "r123.example.test";', "src/products/websites/public-suffix-data.ts"), []);
});

test("reservation is forbidden in visitor copy, including generated site runtimes", () => {
  for (const name of [
    "src/experience/bookings/PublicBooking.tsx", "src/app/b/token/page.tsx",
    "src/app/booking-confirm/token/page.tsx", "src/app/pay/business/page.tsx",
    "src/app/preview/strelva/deposit/page.tsx", "src/products/connected-sites/form.ts",
    "custom-repo-starter/StrelvaBookingForm.tsx", "custom-repo-starter/website-generation/capability-runtime.mjs",
    "public/connect.js",
  ]) {
    assert.ok(screenWordProblems('const screen = `<p>Your reservation is held.</p>`;', name).some(hit => hit.word === "reservation (visitor)"), name);
    assert.deepEqual(screenWordProblems('const contract = { kind: "reservation" }; const route = "/reservations";', name), []);
  }
  assert.deepEqual(check('const message = "A held reservation is an internal scheduling record.";'), []);
  assert.deepEqual(screenWordProblems('throw new Error("A provider reservation needs recovery.");', "src/products/scheduling/calendar/service.ts"), []);
});

// ADR 0016: providers are Connections on workspace screens.
test("uses Connections rather than integrations as the screen noun", () => {
  assert.equal(screenWordProblems('<h1>Integrations</h1>', 'src/experience/connections/Test.tsx').length, 1);
  assert.equal(screenWordProblems('<h1>Connections</h1>', 'src/experience/connections/Test.tsx').length, 0);
});
