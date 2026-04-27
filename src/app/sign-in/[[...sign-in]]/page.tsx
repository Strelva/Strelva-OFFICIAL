import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { SignInClient } from "./SignInClient";

export default async function SignInPage() {
  const tenant = await getTenantFromHeaders();
  const config = await getTenantConfig(tenant);
  const siteName = config?.siteName || "Scaffold Web";

  return <SignInClient siteName={siteName} />;
}
