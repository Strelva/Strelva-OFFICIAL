import { notFound } from "next/navigation";
import { AgencyClientAvailabilityFixture } from "./fixture";
export const dynamic = "force-dynamic";
export default function Proof() {
 if (process.env.NODE_ENV !== "development" || process.env.STRELVA_UI_PREVIEW !== "1") notFound();
 return <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black sm:px-8"><div className="mx-auto max-w-4xl"><p className="mb-4 text-xs text-gray-muted">Fictional local interface proof · no account or provider access</p><h1 className="mb-8 text-2xl font-medium">Fictional Buffalo client</h1><AgencyClientAvailabilityFixture /></div></main>;
}
