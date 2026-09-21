/** This visual fixture must never become an alternative authentication path. */
export function strelvaHostedPreviewEnabled(environment = process.env): boolean {
  return environment.VERCEL_ENV === "preview" && environment.STRELVA_UI_PREVIEW === "1";
}

export function strelvaUiPreviewEnabled(environment = process.env): boolean {
  return (environment.NODE_ENV === "development" && environment.STRELVA_UI_PREVIEW === "1")
    || strelvaHostedPreviewEnabled(environment);
}
