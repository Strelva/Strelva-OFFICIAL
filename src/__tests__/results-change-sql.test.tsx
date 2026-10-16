// @vitest-environment jsdom
/**
 * Results' "The change that mattered" rendered from rows a real Postgres
 * returned through read_strelva_handled. Runs only under
 * scripts/check-results-change-sql.sh, which applies every migration to a
 * throwaway cluster, decides one owner decision and writes the two reads to
 * the files named below. Skipped in the ordinary suite (no database there).
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resultsChange, WorkspaceResultsView } from "@/experience/places/WorkspaceResults";
import { handledFromStore, mergeHandled } from "@/platform/needs-you/handled";
import { resolveRange } from "@/platform/infra/analytics/range";
import type { SiteResults } from "@/products/websites/client";

const handledFile = process.env.STRELVA_RESULTS_HANDLED_JSON;
const emptyFile = process.env.STRELVA_RESULTS_HANDLED_EMPTY_JSON;
const WS = "ae000000-0000-4000-8000-000000000010";

/** What readStrelvaHandled does with the store's rows: project each, keep the window, newest first. */
const receipts = (file: string) => {
  const rows = JSON.parse(readFileSync(file, "utf8").trim()) as Record<string, unknown>[];
  return mergeHandled(rows.map(handledFromStore), Date.now() - 7 * 86_400_000);
};

function page(latest: ReturnType<typeof resultsChange>) {
  const range = resolveRange("live");
  const site = { tenantId: "harbor", tenantStableId: "ae000000-0000-4000-8000-0000000000b9", siteName: "harbordental.com", anomaly: null, visitorSeries: [], milestone: null,
    stats: { range, pageViews: 361, pageViewsPrior: 320, pageViewsDelta: 41, actions: 31, actionsPrior: 26, actionsDelta: 5, bookingClicks: 24, bookingClicksPrior: 20, phoneClicks: 7, phoneClicksPrior: 6, hasData: true, series: [] },
    searchPerf: null, gaPerf: null, aiVisibility: null, health: null } as unknown as SiteResults;
  return renderToStaticMarkup(<WorkspaceResultsView workspaceId={WS} state={{ kind: "ready", data: { sites: [site], denied: [] } }} range="live" latest={latest}
    chrome={{ appBase: "/preview/strelva", signOut: null, systemsReleased: true, workspaceName: "Harbor Fixture Dental", accountName: "Owner" }} />);
}
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe.skipIf(!handledFile || !emptyFile)("Results reads the change that mattered from Postgres", () => {
  it("renders the decided owner decision as the change that mattered, with its date", () => {
    const handled = receipts(handledFile!);
    expect(handled.length).toBeGreaterThan(0);
    const latest = resultsChange(handled, WS);
    expect(latest).not.toBeNull();
    expect(latest!.sentence).toMatch(/Priya Shah/);
    const text = words(page(latest));
    expect(text).toContain("The change that mattered");
    expect(text).toContain(latest!.sentence);
    expect(text).toMatch(/[A-Z][a-z]{2} \d{1,2} · See it/);
  });
  it("says a quiet week plainly when Postgres has nothing for the business", () => {
    const handled = receipts(emptyFile!);
    expect(handled).toEqual([]);
    const latest = resultsChange(handled, WS);
    expect(latest).toBeNull();
    expect(words(page(latest))).toContain("Nothing on harbordental.com changed in the last 7 days.");
  });
});
