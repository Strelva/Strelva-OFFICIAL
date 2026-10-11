"use client";
import { useEffect, useState } from "react";
import { AgencyBrandEditor } from "./AgencyBrandEditor";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { renderEmailHtml } from "@/platform/infra/email/layout";
/** Fictional local UI evidence only; the preview page uses the existing preview gate. */
export function AgencyBrandFixture({ brand }: { brand: OwnerBrand }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const original = window.fetch;
    // Isolated fictional transport for this fixture. No database or email access.
    window.fetch = async (url, init) => {
      if (String(url).includes("/api/workspace/agency-brand")) {
        if (new URLSearchParams(window.location.search).get("state") === "error") return new Response(JSON.stringify({ error: "Your brand is unavailable. Reload to try again." }), { status: 503 });
        if (new URLSearchParams(window.location.search).get("state") === "permission") return new Response(JSON.stringify({ error: "Only the agency owner can change its brand." }), { status: 403 });
        const value = init?.body ? JSON.parse(String(init.body)).brand : { displayName: brand.name, accentColor: brand.accentColor, replyTo: brand.replyTo, logo: null, credit: "runs_on_strelva" };
        return new Response(JSON.stringify({ brand: value }), { status: 200 });
      }
      return original(url, init);
    };
    const frame = requestAnimationFrame(() => setReady(true));
    return () => { cancelAnimationFrame(frame); window.fetch = original; };
  }, [brand]);
  const html = renderEmailHtml({ brand, heading: "Your weekly report", paragraphs: ["Your website is working. One decision needs you."], button: { label: "Open Needs you", url: "https://app.strelva.com/workspace" }, footerNote: "for The Mooney Firm" });
  return <div className="mx-auto w-full max-w-4xl overflow-y-auto p-6"><h1 className="font-display text-2xl">Your agency brand</h1>{ready ? <AgencyBrandEditor workspaceId={brand.agencyId!} /> : <p role="status">Loading fixture</p>}<h2 className="mt-8 text-xl">Owner email</h2><iframe title="Owner email preview" srcDoc={html} sandbox="" style={{ width: "100%", height: 600, border: 0 }} /></div>;
}
