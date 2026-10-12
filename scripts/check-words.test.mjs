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
