/** This visual fixture must never become an alternative authentication path. */
export function strelvaUiPreviewEnabled(environment = process.env): boolean {
  return environment.NODE_ENV === "development" && environment.STRELVA_UI_PREVIEW === "1";
}
