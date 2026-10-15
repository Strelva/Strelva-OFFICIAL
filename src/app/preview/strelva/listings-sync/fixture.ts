import type { ListingFix, ListingsSyncView, SurfaceReading } from "@/products/listings-sync";

/** Fictional Buffalo businesses only. No account, provider or network. */
const WS = "29100000-0000-4000-8000-000000000010";
const NOW = "2026-10-15T14:00:00Z";

const base: ListingsSyncView = {
  workspaceId: WS, access: "owner", checkedAt: NOW, checking: false, recordRevision: 4, surfaces: [], fixes: [], release: null,
  pendingConfirmation: 0, waitingOnOwner: false, lastError: null,
};

const website = (facts: SurfaceReading["facts"], over: Partial<SurfaceReading> = {}): SurfaceReading => ({
  surfaceKey: "website:tenant:harbor", kind: "website", label: "harbordental.example.test", url: "https://harbordental.example.test/", changeBy: "request", state: "read", facts, ...over,
});
const google = (facts: SurfaceReading["facts"], over: Partial<SurfaceReading> = {}): SurfaceReading => ({
  surfaceKey: "google:loc1", kind: "google", label: "Harbor Dental, Elmwood Village", url: null, changeBy: "owner", state: "read", facts, ...over,
});
const booking = (facts: SurfaceReading["facts"]): SurfaceReading => ({
  surfaceKey: "booking:main", kind: "booking", label: "Booking page", url: null, changeBy: "strelva", state: "read", facts,
});
const fix = (over: Partial<ListingFix>): ListingFix => ({
  id: "29100000-0000-4000-8000-0000000000f1", surfaceKey: "booking:main", factKey: "hours", kind: "booking_hours", proposed: {}, status: "proposed",
  outcomeRef: null, reason: null, recordRevision: 4, ...over,
});

export const matches: ListingsSyncView = {
  ...base,
  surfaces: [
    website([{ fact: "phone", state: "matches", shown: "(716) 555-0100", expected: "(716) 555-0100" }, { fact: "hours", state: "matches", shown: null, expected: null }]),
    google([{ fact: "phone", state: "matches", shown: "(716) 555-0100", expected: "(716) 555-0100" }, { fact: "hours", state: "matches", shown: null, expected: null }, { fact: "address", state: "matches", shown: null, expected: null }]),
    booking([{ fact: "hours", state: "follows", shown: null, expected: null }, { fact: "phone", state: "follows", shown: null, expected: null }]),
  ],
  release: { number: 3, recordedAt: NOW },
};

export const twoDiffer: ListingsSyncView = {
  ...base,
  surfaces: [
    google([{ fact: "hours", state: "differs", shown: "Mon 9:00–17:00", expected: "Mon 8:00–16:00" }, { fact: "phone", state: "matches", shown: null, expected: null }], { changeBy: "strelva" }),
    booking([{ fact: "hours", state: "differs", shown: "Monday 18:00–20:00", expected: "Inside your hours" }]),
  ],
  fixes: [
    fix({}),
    fix({ id: "29100000-0000-4000-8000-0000000000f2", surfaceKey: "google:loc1", kind: "google_hours", proposed: { locationId: "loc1" } }),
  ],
  waitingOnOwner: true,
};

export const waitingOnGoogle: ListingsSyncView = {
  ...base,
  surfaces: [
    website([{ fact: "phone", state: "matches", shown: "(716) 555-0100", expected: "(716) 555-0100" }]),
    google([{ fact: "phone", state: "waiting_on_google", shown: null, expected: "(716) 555-0100" }, { fact: "hours", state: "waiting_on_google", shown: null, expected: null }], { state: "waiting_on_google" }),
  ],
};

export const noAgency: ListingsSyncView = {
  ...base,
  surfaces: [website([{ fact: "phone", state: "differs", shown: "(716) 555-9999", expected: "(716) 555-0100" }], { changeBy: "owner" })],
  fixes: [fix({ id: "29100000-0000-4000-8000-0000000000f3", surfaceKey: "website:tenant:harbor", factKey: "page", kind: "owner_todo",
    proposed: { lines: ["Phone: change “(716) 555-9999” to “(716) 555-0100”"] } })],
};

export const agencyWaiting: ListingsSyncView = {
  ...twoDiffer, access: "admin", pendingConfirmation: 1,
};
