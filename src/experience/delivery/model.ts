/** Synthetic interface records. Never used as authorization or production delivery state. */
export type Audience = "agency" | "client";
export type RequestStage =
  "draft" | "scoping" | "building" | "review" | "delivered";
export type DeliveryRequest = {
  id: string;
  clientId: string;
  title: string;
  description: string;
  stage: RequestStage;
  note?: string;
};
export const stageLabels: Record<RequestStage, string> = {
  draft: "Draft",
  scoping: "Defining scope",
  building: "In implementation",
  review: "Your review",
  delivered: "Delivered",
};
export function createDraft(
  clientId: string,
  title: string,
  description: string,
  clientIds: readonly string[],
  id: string,
): DeliveryRequest {
  if (!clientIds.includes(clientId))
    throw new Error("Choose a client in this workspace.");
  if (!title.trim() || !description.trim())
    throw new Error("Add a title and describe the result you need.");
  if (title.trim().length > 120 || description.trim().length > 4000)
    throw new Error(
      "Keep the title within 120 characters and the description within 4,000.",
    );
  return {
    id,
    clientId,
    title: title.trim(),
    description: description.trim(),
    stage: "draft",
  };
}
