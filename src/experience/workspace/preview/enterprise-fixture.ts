/** Fictional canon clinics, people and coverage. No provider or live records are used. */
export const ENTERPRISE_NAME = "Lakeshore Physical Therapy";
export const ENTERPRISE_LOCATIONS = [
  { id: "elmwood", name: "Elmwood", manager: "Maria K.", health: "All live", kind: "live" as const, standards: "4 of 4", note: "Local intake change", preview: "Has a local question 7. v5 keeps it and adds the new one after it.", previewKind: "need" as const },
  { id: "downtown", name: "Downtown", manager: "Jae P.", health: "All live", kind: "live" as const, standards: "4 of 4", note: "", preview: "Ready", previewKind: "live" as const },
  { id: "amherst", name: "Amherst", manager: "Rosa T.", health: "All live", kind: "live" as const, standards: "4 of 4", note: "", preview: "Ready", previewKind: "live" as const },
  { id: "tonawanda", name: "Tonawanda", manager: "Dev S.", health: "Form failing", kind: "down" as const, standards: "3 of 4", note: "", preview: "Ready · their form is failing for another reason. Fix it first.", previewKind: "need" as const },
  { id: "orchard-park", name: "Orchard Park", manager: null, health: "All live", kind: "live" as const, standards: "4 of 4", note: "No manager", preview: "No manager to say yes. Goes to you.", previewKind: "need" as const },
  { id: "lockport", name: "Lockport", manager: "Kim L.", health: "Setting up", kind: "draft" as const, standards: "1 of 4", note: "Opens Nov 3", preview: "Skipped · not open yet", previewKind: "draft" as const },
];
export const ENTERPRISE_REVIEW = [
  { id: "pat", name: "Pat O.", location: "Tonawanda", role: "Manager", lastUse: "94 days", inactive: true, kept: false },
  { id: "north", name: "North Studio", location: "All clinics", role: "Agency", lastUse: "Today", inactive: false, kept: true },
  { id: "sam", name: "Sam W.", location: "Elmwood", role: "Front desk", lastUse: "71 days", inactive: true, kept: false },
  { id: "lee", name: "Lee M.", location: "Downtown", role: "Front desk", lastUse: "63 days", inactive: true, kept: false },
  { id: "maria", name: "Maria K.", location: "Elmwood", role: "Manager", lastUse: "Today", inactive: false, kept: true },
];
export type EnterpriseLocation = typeof ENTERPRISE_LOCATIONS[number];
