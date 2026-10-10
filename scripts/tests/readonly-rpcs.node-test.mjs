import { test } from "node:test";
import assert from "node:assert/strict";
import { findReadonlyLockPaths } from "../lib/readonly-rpcs.mjs";
const row = (name, body, volatility = "s") => ({ name, body, volatility });
test("walks every branch through cycles without memoizing an incomplete null", () => {
  const found = findReadonlyLockPaths([
    row("a", "select b(); select c();"),
    row("b", "select a();"),
    row("c", "select * from private_rows for key share;", "v"),
  ]);
  assert.equal(found.length, 2);
  assert.ok(found.some((finding) => finding === "b: b -> a -> c"));
});
test("ignores comments and follows schema-qualified calls through VOLATILE helpers", () => {
  assert.deepEqual(findReadonlyLockPaths([
    row("reader", "-- for update\n select public.helper();"),
    row("helper", "/* for share */ select * from rows for no key update;", "v"),
    row("ordinary", "/* for update */ select 1;"),
  ]), ["reader: reader -> helper"]);
});
test("reports overloaded signatures separately rather than losing one definition", () => {
  const found = findReadonlyLockPaths([
    { ...row("reader", "select 1;"), signature: "reader(uuid)" },
    { ...row("reader", "select * from rows for share;"), signature: "reader(text)" },
  ]);
  assert.deepEqual(found, ["reader(text): reader"]);
});
test("VOLATILE writers and lock-free recursive readers are not findings", () => {
  assert.deepEqual(findReadonlyLockPaths([
    row("writer", "select * from rows for update;", "v"),
    row("a", "select b();"), row("b", "select a();"),
  ]), []);
});
