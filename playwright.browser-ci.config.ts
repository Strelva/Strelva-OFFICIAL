import { defineConfig } from "@playwright/test";
import config from "./playwright.config";
import manifest from "./scripts/browser-ci-manifest.json";
import { browserServerCommand } from "./scripts/browser-ci-contexts.mjs";

const context = process.env.STRELVA_BROWSER_CI_CONTEXT;
if (!["public", "preview", "workspace", "recorded"].includes(context || "")) throw new Error("An explicit browser CI context is required.");
if (process.env.PLAYWRIGHT_BASE_URL) throw new Error("Browser CI owns its loopback server; external base URLs are refused.");
const port = process.env.PLAYWRIGHT_PORT || "3100";
const files = manifest.entries.filter(entry => entry.context === context).map(entry => entry.file);
if (!files.length) throw new Error("No recorded cases for this browser context.");

export default defineConfig({
  ...config,
  testMatch: files.map(file => new RegExp(`/tests/${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)),
  webServer: {
    ...config.webServer,
    command: browserServerCommand(context, port, process.env.PLAYWRIGHT_BUILT_APP || "0"),
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
