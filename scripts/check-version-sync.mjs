import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marketingRoot = process.env.STRELVA_MARKETING_ROOT
  ? resolve(process.env.STRELVA_MARKETING_ROOT)
  : resolve(repoRoot, "../strelva-marketing");
const siblingPackage = resolve(marketingRoot, "package.json");

const [app, marketing] = await Promise.all(
  [resolve(repoRoot, "package.json"), siblingPackage].map(async (path) =>
    JSON.parse(await readFile(path, "utf8")),
  ),
);

if (app.version !== marketing.version) {
  throw new Error(
    `Strelva versions must match: app=${app.version}, marketing=${marketing.version}`,
  );
}

console.log(`Strelva app and marketing are both v${app.version}.`);
