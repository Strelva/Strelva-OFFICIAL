import { ProductShell } from "@/experience/product/ProductShell";
import { getSessionUser } from "@/lib/db/server-client";
export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return <ProductShell email={user?.email}>{children}</ProductShell>;
}
