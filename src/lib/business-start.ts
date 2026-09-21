/** Public entry destinations. These are navigation hints, never permission grants. */
export const BUSINESS_START_PRODUCTS = ["applications", "onboarding", "tracker", "document", "help", "website"] as const;
export type BusinessStartProduct = typeof BUSINESS_START_PRODUCTS[number];

export function isBusinessStartProduct(value: unknown): value is BusinessStartProduct {
  return typeof value === "string" && (BUSINESS_START_PRODUCTS as readonly string[]).includes(value);
}

export function businessStartHref(product: BusinessStartProduct): string {
  return `/workspace/business/new?start=${product}`;
}

/** An agency request must not send its customer into the website generator. */
export function businessStartView(product: BusinessStartProduct): Exclude<BusinessStartProduct, "website"> {
  return product === "website" ? "help" : product;
}

/** Static intent only. User-written briefs and credentials never travel in this URL. */
export function businessStartRequest(product: BusinessStartProduct): string {
  return product === "website" ? "Have Strelva build a website for my business." : "";
}
