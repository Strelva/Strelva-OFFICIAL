// Motion gate. Every duration and curve in product UI comes from
// src/app/styles/motion.css (CSS) or src/platform/infra/motion.ts (JS).
// Fails on raw durations, curves, or Tailwind timing classes elsewhere, and on
// drift between the CSS ladder and the JS ladder. Delays stay free: they are
// choreography offsets, not a second timing system. Spec: docs/design/motion.md.
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "src");

// Client websites carry each client's own brand motion; legacy /dashboard is
// being removed; /pay is live Stripe checkout and is left alone.
const EXEMPT = [
  "src/app/styles/motion.css",
  "src/platform/infra/motion.ts",
  "src/components/templates/",
  "src/components/public/",
  "src/components/dashboard/",
  "src/app/dashboard/",
  "src/app/pay/",
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (/\.(css|tsx)$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(path);
  }
  return out;
}

function splitTop(value) {
  const parts = [];
  let depth = 0, current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(current); current = ""; } else current += ch;
  }
  parts.push(current);
  return parts;
}

const TIME = /(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g;
const CURVE = /cubic-bezier\(|(?<![\w-])(ease|ease-in|ease-out|ease-in-out)(?![\w-])|(?<![\w-])linear\(/;
const DECL = /\b(transition|animation)(-duration|-timing-function|-delay)?\s*:\s*([^;{}"`]+)/g;

function cssProblems(text) {
  const problems = [];
  for (const match of text.matchAll(DECL)) {
    const [, kind, part = "", value] = match;
    if (part === "-delay") continue;
    const line = text.slice(0, match.index).split("\n").length;
    for (const segment of splitTop(value)) {
      if (CURVE.test(segment)) problems.push([line, `raw curve in ${kind}${part}: ${segment.trim()}`]);
      if (part === "-timing-function") continue;
      // Outside var()/calc(), the first time in a shorthand segment is the
      // duration; a raw time after a --motion-* step is that segment's delay.
      for (const time of segment.matchAll(TIME)) {
        const before = segment.slice(0, time.index);
        if (part === "" && /var\(--motion-/.test(before)) break;
        if ((before.match(/\(/g) ?? []).length > (before.match(/\)/g) ?? []).length) continue;
        if (Number(time[1]) === 0 || parseFloat(time[1]) * (time[2] === "s" ? 1000 : 1) < 1) break;
        problems.push([line, `raw duration ${time[0]} in ${kind}${part}: use a --motion-* step`]);
        break;
      }
    }
  }
  return problems;
}

const TAILWIND = /(?<![\w-])(duration-(?:\d+|\[[^\]]+\])|ease-(?:in|out|in-out|linear|\[[^\]]+\])|transition-all|delay-\[)(?![\w-])/g;
const JS_TIMING = /\b(duration|visualDuration):\s*\d*\.?\d+\b/g;

function tsxProblems(text) {
  const problems = [...cssProblems(text)];
  for (const pattern of [TAILWIND, JS_TIMING]) {
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split("\n").length;
      problems.push([line, pattern === TAILWIND
        ? `Tailwind ${match[1]}: use the default transition (fast), duration-(--motion-*) or a named property list`
        : `literal ${match[0]}: use strelvaMotion / strelvaDuration`]);
    }
  }
  return problems;
}

async function ladderParity() {
  const css = await readFile(resolve(src, "app/styles/motion.css"), "utf8");
  const ts = await readFile(resolve(src, "platform/infra/motion.ts"), "utf8");
  const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
  const problems = [];
  for (const step of ["press", "fast", "base", "slow", "long", "hold", "stagger"]) {
    const cssMs = Number(rootBlock.match(new RegExp(`--motion-${step}:\\s*(\\d+)ms`))?.[1]);
    const tsS = Number(ts.match(new RegExp(`\\b${step}:\\s*(\\d*\\.?\\d+),`))?.[1]);
    if (!Number.isFinite(cssMs) || !Number.isFinite(tsS) || Math.round(tsS * 1000) !== cssMs) {
      problems.push(`ladder drift: --motion-${step} is ${cssMs}ms in motion.css, strelvaDuration.${step} is ${tsS}s in motion.ts`);
    }
  }
  return problems;
}

const failures = [];
for (const file of await walk(src)) {
  const rel = relative(root, file);
  if (EXEMPT.some((prefix) => rel === prefix || rel.startsWith(prefix))) continue;
  const text = await readFile(file, "utf8");
  for (const [line, message] of file.endsWith(".css") ? cssProblems(text) : tsxProblems(text)) {
    failures.push(`${rel}:${line}  ${message}`);
  }
}
failures.push(...(await ladderParity()));

if (failures.length) {
  console.error(`Motion check failed (${failures.length}):\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("Motion check passed: every duration and curve comes from the motion ladder.");
