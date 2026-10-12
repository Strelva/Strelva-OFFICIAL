import { expect, test } from "@playwright/test";

test("public smoke keeps preview-only and disposable fixture routes hidden", async ({ request }) => {
  expect(process.env.STRELVA_UI_PREVIEW).toBe("0");
  for (const path of ["agent-oauth", "architecture-union-proof", "architecture-union-inquiry-proof", "opened-work-proof"]) {
    const response = await request.get(`/preview/strelva/${path}`);
    expect(response.status(), path).toBe(404);
  }
});
