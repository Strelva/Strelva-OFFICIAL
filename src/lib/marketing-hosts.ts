export const DEFAULT_MARKETING_HOSTS = [
  "scaffoldweb.com",
  "www.scaffoldweb.com",
  "localhost",
  "localhost:3000",
  "localhost:3001",
  "127.0.0.1",
  "127.0.0.1:3000",
  "127.0.0.1:3001",
  "reb-studio.vercel.app",
] as const;

export function parseMarketingDomains(raw = process.env.MARKETING_DOMAINS || ""): string[] {
  return raw
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .map((host) => host.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
}

export const MARKETING_HOSTS = new Set([
  ...DEFAULT_MARKETING_HOSTS,
  ...parseMarketingDomains(),
]);

export function isMarketingHost(host: string): boolean {
  const normalizedHost = host.toLowerCase();
  const hostWithoutPort = normalizedHost.split(":")[0];
  return MARKETING_HOSTS.has(normalizedHost) || MARKETING_HOSTS.has(hostWithoutPort);
}
