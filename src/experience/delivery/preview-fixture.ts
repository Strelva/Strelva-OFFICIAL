import type { Audience, DeliveryRequest } from "./model";
import { beginRequestSession } from "./request-session";

export const clients = [
  {
    id: "harbor",
    name: "Harbor Dental",
    domain: "harbor.example",
    initials: "HD",
    description: "Family dentistry · Buffalo, NY",
  },
  {
    id: "north",
    name: "North Coast Realty",
    domain: "northcoast.example",
    initials: "NC",
    description: "Independent real estate brokerage",
  },
  {
    id: "field",
    name: "Fieldwork Studio",
    domain: "fieldwork.example",
    initials: "FS",
    description: "Architecture & interiors",
  },
];
export function initialRequests(
  audience: Audience,
  empty = false,
): DeliveryRequest[] {
  if (empty) return [];
  const records: DeliveryRequest[] = [
    {
      id: "intake",
      clientId: "harbor",
      title: "New patient intake",
      description:
        "Let patients complete an intake form before their first appointment. Send the practice a notification when a form is received.",
      stage: "review",
    },
    {
      id: "finder",
      clientId: "north",
      title: "Home Finder",
      description:
        "Add property search to the brokerage website, with a clear path to contact an agent.",
      stage: "scoping",
    },
    {
      id: "projects",
      clientId: "field",
      title: "Project inquiry form",
      description:
        "Collect project location, budget range, and intended start date before the first conversation.",
      stage: "building",
    },
  ];
  return audience === "client"
    ? records.filter((item) => item.clientId === "harbor")
    : records;
}

export function beginPreviewSession(
  audience: Audience,
  options: { empty?: boolean; readOnly?: boolean } = {},
) {
  return beginRequestSession({
    clientIds:
      options.empty && audience === "agency"
        ? []
        : audience === "agency"
          ? clients.map((client) => client.id)
          : ["harbor"],
    readOnly: Boolean(options.readOnly),
    requests: initialRequests(audience, options.empty),
  });
}
