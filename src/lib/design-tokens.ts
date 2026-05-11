import type { ThemeContent } from "@/lib/types";

export function themeContentToCssVars(theme: ThemeContent | null | undefined): Record<string, string> {
  if (!theme) return {};

  return {
    "--cream": theme.colors.cream,
    "--cream-dark": theme.colors.creamDark,
    "--cream-mid": theme.colors.creamMid,
    "--sage": theme.colors.sage,
    "--sage-light": theme.colors.sageLight,
    "--sage-dark": theme.colors.sageDark,
    "--bark": theme.colors.bark,
    "--bark-light": theme.colors.barkLight,
    "--bark-faded": theme.colors.barkFaded,
    "--wheat": theme.colors.wheat,
    "--wheat-light": theme.colors.wheatLight,
    "--terra": theme.colors.terra,
    "--terra-light": theme.colors.terraLight,
    "--font-display": theme.fontDisplay,
    "--font-body": theme.fontBody,
  };
}
