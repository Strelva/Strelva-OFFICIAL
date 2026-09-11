import type { ManagedWork, WorkspaceProduct } from "./contracts";

/**
 * Discovery is a data projection of the active workspace shell. Keeping the
 * allowlist and URL guard here lets `WorkspaceLayout` render one navigation
 * model without importing the retired product-shelf component.
 */
export type ManagedWorkSummary = ManagedWork;

const CONSUMER_PRODUCT_IDS = new Set(["ai_visibility", "managed_presence", "homefinder", "inquiries", "tracker", "documents"]);

export function discoveryProducts(products: readonly WorkspaceProduct[]): WorkspaceProduct[] {
  return products.filter((product) => CONSUMER_PRODUCT_IDS.has(product.id));
}

export interface SameAppHrefOptions {
  /** Keep local synthetic previews available in development and test fixtures. */
  allowLocalhost?: boolean;
  nodeEnv?: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function sameAppHref(href: string, options: SameAppHrefOptions = {}): string | null {
  if (typeof href !== "string" || /[\u0000-\u0020\u007f]/.test(href)) return null;
  const value = href.trim();
  if (!value || value.includes("\\")) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;

    if (url.protocol === "https:" && url.hostname === "app.strelva.com") {
      return !url.port || url.port === "443" ? value : null;
    }

    const nodeEnv = options.nodeEnv ?? (typeof process === "undefined" ? undefined : process.env.NODE_ENV);
    const allowLocalhost = options.allowLocalhost ?? nodeEnv !== "production";
    if (allowLocalhost && url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return value;
    return null;
  } catch {
    return null;
  }
}
