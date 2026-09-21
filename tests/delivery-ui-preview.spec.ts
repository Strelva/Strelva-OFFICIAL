import { expect, test, type Page } from "@playwright/test";

test.skip(
  process.env.STRELVA_UI_PREVIEW !== "1",
  "Requires the development-only interface preview.",
);
async function open(page: Page, path: string) {
  await page.goto(`/preview/strelva/${path}`);
  await expect(page.locator('[data-delivery-ready="true"]')).toBeVisible();
}

test("agency request retains the selected client and stays a draft", async ({
  page,
}) => {
  await open(page, "agency");
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.getByLabel("Client", { exact: true }).selectOption("north");
  await page.getByLabel("What do you need?").fill("Viewing appointments");
  await page
    .getByLabel("Describe the result")
    .fill("Let buyers request a viewing for a selected property.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Viewing appointments" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("North Coast Realty");
  await expect(page.getByRole("status")).toContainText("Nothing has been sent");
  await page.getByRole("button", { name: "All requests", exact: true }).click();
  await page.getByLabel("Show", { exact: true }).selectOption("draft");
  await expect(
    page.getByRole("button", { name: /Viewing appointments/ }),
  ).toBeVisible();
});

test("customer review requires feedback and does not publish", async ({
  page,
}) => {
  await open(page, "client");
  await expect(
    page.getByRole("button", { name: "Clients", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /New patient intake/ }).click();
  await page
    .getByRole("button", { name: "Save requested changes", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Describe what should change",
  );
  await page
    .getByLabel("Feedback", { exact: true })
    .fill("Make appointment preference optional.");
  await page
    .getByRole("button", { name: "Save requested changes", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("has not been sent");
  await page
    .getByRole("button", { name: "Record approval", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Nothing was published");
});

test("mobile navigation restores focus and state boundaries remain explicit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await open(page, "agency");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  for (const audience of ["agency", "client"]) {
    await open(page, `${audience}?state=unavailable`);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(
      0,
    );
    await open(page, `${audience}?state=empty`);
    await expect(page.locator("main")).toContainText("No requests yet");
    await open(page, `${audience}?state=read-only`);
    await expect(
      audience === "client"
        ? page.getByRole("textbox", {
            name: "Describe what you’d like to build or change",
          })
        : page.getByRole("button", { name: /What does your client/ }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
});

test("local entry, draft editing, reload, and browser history stay connected", async ({
  page,
}) => {
  await page.goto("/preview/strelva/start");
  await page.getByRole("link", { name: /Open business interface/ }).click();
  await expect(page.locator('[data-delivery-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.getByLabel("What do you need?").fill("A booking page");
  await page
    .getByLabel("Describe the result")
    .fill("Let customers choose a consultation time.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/view=detail&request=/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A booking page" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await page.getByLabel("What do you need?").fill("Consultation booking");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "All requests", exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Consultation booking" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View agency interface" }).click();
  await expect(page.locator('[data-delivery-ready="true"]')).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Consultation booking");
});

test("storage failure keeps the draft visible and explains reload risk", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage disabled");
    };
  });
  await open(page, "client");
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.getByLabel("What do you need?").fill("A safe draft");
  await page
    .getByLabel("Describe the result")
    .fill("Keep the text when storage fails.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A safe draft" }),
  ).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Browser storage is unavailable",
  );
});

test("marketing carries an idea into the local customer interface", async ({
  page,
}) => {
  test.skip(
    !process.env.STRELVA_MARKETING_REVIEW_URL,
    "Requires the local marketing review server.",
  );
  await page.goto(process.env.STRELVA_MARKETING_REVIEW_URL!);
  await page
    .getByRole("link", { name: "Start with Strelva", exact: true })
    .click();
  await expect(page).toHaveURL(/\/preview\/strelva\/start$/);
  await page.getByRole("link", { name: /Open agency interface/ }).click();
  await expect(page.locator('[data-delivery-ready="true"]')).toBeVisible();
  await page.goto(process.env.STRELVA_MARKETING_REVIEW_URL!);
  await page
    .getByLabel("What would you like to build?")
    .fill("A portal with appointment details");
  await page.getByRole("button", { name: "Continue with your idea" }).click();
  await expect(page.getByLabel("Describe the result")).toHaveValue(
    "A portal with appointment details",
  );
  await expect(page).toHaveURL(/\/preview\/strelva\/client\?/);
});

test("business composer, context, integrations and navigation use working destinations", async ({
  page,
}) => {
  await open(page, "client");
  await page
    .getByRole("textbox", {
      name: "Describe what you’d like to build or change",
    })
    .fill("Let patients choose an appointment time.");
  await page.getByRole("button", { name: "Continue with your idea" }).click();
  await expect(page.getByLabel("Describe the result")).toHaveValue(
    "Let patients choose an appointment time.",
  );
  await page.getByLabel("What do you need?").fill("Appointment preferences");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Appointment preferences.*Draft/ }),
  ).toBeVisible();
  const context = page.getByRole("complementary", {
    name: "Your business context",
  });
  const contextTitle = await context.getByRole("heading", { name: "Your business", exact: true }).boundingBox();
  const mainArea = await page.locator("main").boundingBox();
  expect(contextTitle!.y).toBeGreaterThanOrEqual(mainArea!.y);
  await context.getByRole("button", { name: /Integrations/ }).click();
  await expect(
    page.getByRole("heading", { name: "Integrations", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("No services are connected");
  await page
    .getByRole("button", { name: "Request connection" })
    .first()
    .click();
  await expect(page.getByLabel("What do you need?")).toHaveValue(
    "Connect scheduling",
  );
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Email hello@strelva.com" }),
  ).toHaveAttribute("href", "mailto:hello@strelva.com");
});

test("business home reflows with keyboard-accessible controls", async ({
  page,
}) => {
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, "client");
    await expect(
      page.getByRole("heading", {
        name: "What should your business be able to do next?",
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await expect(
      page.getByRole("complementary", { name: "Your business context" }),
    ).toBeVisible();
  }
});

test("business appearance persists and follows system changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page, "client");
  const root = page.locator("[data-appearance]");
  const appearance = page.getByLabel("Appearance");
  await expect(root).toHaveAttribute("data-appearance", "light");
  await appearance.selectOption("dark");
  await expect(root).toHaveAttribute("data-appearance", "dark");
  await page.reload();
  await expect(appearance).toHaveValue("dark");
  await expect(root).toHaveAttribute("data-appearance", "dark");
  await appearance.selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-appearance", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-appearance", "light");
  await appearance.selectOption("dark");
  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(appearance).toBeVisible();
  await appearance.selectOption("light");
  await expect(root).toHaveAttribute("data-appearance", "light");
  await page.getByRole("button", { name: "Close navigation", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
