import { isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "example.test" }) }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/care-reports/release", () => ({ careReportsMayBeOn: () => true, careReportEmailEnabled: () => false, careReportShareLinksEnabled: () => false }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: async () => ({ userId: "staff", verifiedEmail: "staff@example.test" }) }));
vi.mock("@/platform/agency-brand/server", async () => ({ resolveOwnerBrand: async () => (await import("@/experience/care-reports/preview-fixture")).PREVIEW_BRAND }));
vi.mock("@/server/care-reports/server", () => ({ readCareReportForViewer: mocks.read }));
import CareReportPage from "@/app/workspace/care-reports/[reportId]/page";
import { CareReportDocument } from "@/experience/care-reports/CareReportDocument";
import { CareReportEditor } from "@/experience/care-reports/CareReportEditor";
import { PREVIEW_AGENCY_ID, PREVIEW_REPORT_ID, previewAgencyView } from "@/experience/care-reports/preview-fixture";

function propsFor(node: ReactNode, type: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(node)) return node.map(child => propsFor(child, type)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return;
  if (node.type === type) return node.props;
  return propsFor(node.props.children, type);
}
const render = (release?: string) => CareReportPage({
  params: Promise.resolve({ reportId: PREVIEW_REPORT_ID }),
  searchParams: Promise.resolve({ workspaceId: PREVIEW_AGENCY_ID, ...(release ? { release } : {}) }),
});

beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue(previewAgencyView()); });

it("shows the agency the editor when no Release is asked for", async () => {
  const page = await render();
  expect(propsFor(page, CareReportEditor)).toBeTruthy();
  expect(propsFor(page, CareReportDocument)).toBeUndefined();
});

it("shows the agency the snapshot that was shared when a Release is asked for", async () => {
  const page = await render("1");
  const document = propsFor(page, CareReportDocument);
  expect(document).toMatchObject({ audience: "agency", releaseNumber: 1 });
  expect(propsFor(page, CareReportEditor)).toBeUndefined();
  expect((document!.releaseHref as (n: number) => string)(2)).toBe(`/workspace/care-reports/${PREVIEW_REPORT_ID}?workspaceId=${PREVIEW_AGENCY_ID}&release=2`);
  expect(document!.back).toEqual({ label: "Report", href: `/workspace/care-reports/${PREVIEW_REPORT_ID}?workspaceId=${PREVIEW_AGENCY_ID}` });
});

it("falls back to the editor for a Release that was not shared", async () => {
  expect(propsFor(await render("9"), CareReportEditor)).toBeTruthy();
  expect(propsFor(await render("abc"), CareReportEditor)).toBeTruthy();
});
