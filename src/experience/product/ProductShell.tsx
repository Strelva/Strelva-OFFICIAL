"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSearch, Globe2 } from "lucide-react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
export function ProductShell({ children, email }: { children: React.ReactNode; email?: string }) {
  const pathname = usePathname();
  // The free check and its saved results draw their own XA entry frame.
  if (pathname.startsWith("/ai-visibility") || pathname.startsWith("/audit")) return <>{children}</>;
  return <StrelvaShell signedIn={Boolean(email)} accountName={email?.split("@")[0]} accountDetail={email}
    title={pathname.startsWith("/audit") ? "Website audit" : "Ask Gemini about your business"}
    navigation={<section aria-label="Assessments"><h2>Assessments</h2>
      <Link href="/ai-visibility" aria-current={pathname.startsWith("/ai-visibility") ? "page" : undefined}><FileSearch size={16} aria-hidden="true" /><span>Ask Gemini about your business</span></Link>
      <Link href="/audit" aria-current={pathname.startsWith("/audit") ? "page" : undefined}><Globe2 size={16} aria-hidden="true" /><span>Website audit</span></Link>
    </section>}>{children}</StrelvaShell>;
}
