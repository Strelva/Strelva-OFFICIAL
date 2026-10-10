import { expect, type Locator, type TestInfo } from "@playwright/test";
import { captureTextPaint, textPaintContrast } from "./painted-text-contrast";

/** Normal-text threshold also applied to headings; records actual paint, never token names. */
export async function assertReadableText(target: Locator, info: TestInfo, label: string) {
  await expect(target).toBeVisible();
  const paint = await target.evaluate(captureTextPaint);
  // Keep diagnostics even when unsupported paint or a low ratio fails the assertion.
  await info.attach(`foreground-${label}`, { body: JSON.stringify(paint), contentType: "application/json" });
  const measurement = textPaintContrast(paint);
  await info.attach(`contrast-${label}`, { body: JSON.stringify(measurement), contentType: "application/json" });
  expect(measurement.ratio, `${label}: normal text against nearest opaque ${measurement.surface}`).toBeGreaterThanOrEqual(4.5);
}
