import { expect, test } from "@playwright/test";
test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated fictional interface fixtures.");
for (const mobile of [false,true]) {
  test(`assigned member ordinary reply and owner-only commitment error (${mobile ? "mobile" : "desktop"})`, async ({page}) => {
    if(mobile) await page.setViewportSize({width:390,height:844});
    let sends=0;
    await page.route("**/api/workspace/inquiries/reply", async route => {
      sends++;
      await route.fulfill({status:409,json:{error:"Prices, dates and promises need the business owner’s approval."}});
    });
    await page.goto("/preview/strelva/places?place=inquiries&reply=1&member=1");
    await page.getByRole("button",{name:"Reply to Priya S."}).click();
    await expect(page.getByText(/inquiries assigned or routed to you/)).toBeVisible();
    await expect(page.getByRole("button",{name:"Prepare appointment times"})).toHaveCount(0);
    await page.getByLabel("Your reply to Priya S.").fill("We reserved Friday.");
    await page.getByRole("button",{name:"Send reply",exact:true}).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Prices, dates and promises need the business owner’s approval.");
    await expect(page.getByLabel("Your reply to Priya S.")).toHaveValue("We reserved Friday.");
    await expect(page.getByLabel("Your reply to Priya S.")).toBeEnabled();
    await page.getByLabel("Your reply to Priya S.").fill("Thanks for your inquiry. Could you tell us more?");
    expect(sends).toBe(1);
    const viewport = page.viewportSize()!;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({path:`output/w6-inquiry-member-${mobile ? "mobile" : "desktop"}.png`,fullPage:true});
  });
}
test("unassigned member receives permission explanation and no direct send control", async({page})=>{
  await page.goto("/preview/strelva/places?place=inquiries&reply=1&member=none");
  await expect(page.getByText("The owner or the assigned team member can reply to this inquiry.")).toBeVisible();
  await expect(page.getByRole("button",{name:/Reply to/})).toHaveCount(0);
  await expect(page.getByRole("article",{name:"Priya S."}).getByRole("link",{name:"Reply by email"})).toHaveCount(0);
});
