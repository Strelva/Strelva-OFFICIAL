import { createDraft, type DeliveryRequest } from "./model";

/** Local interface session, not a persistence store or production authorization boundary. */
export type RequestSession = {
  clientIds: readonly string[];
  readOnly: boolean;
  requests: DeliveryRequest[];
};
export type RequestCommand =
  | {
      kind: "draft" | "edit-draft";
      id: string;
      clientId: string;
      title: string;
      description: string;
    }
  | {
      kind: "review";
      id: string;
      decision: "approve" | "changes";
      feedback: string;
    };

export function beginRequestSession(input: RequestSession): RequestSession {
  if (
    input.requests.some(
      (request) => !input.clientIds.includes(request.clientId),
    )
  ) {
    throw new Error("Request records do not match this workspace.");
  }
  return {
    ...input,
    clientIds: [...input.clientIds],
    requests: input.requests.map((request) => ({ ...request })),
  };
}

/** One command boundary keeps both audiences on the same creation/review rules. */
export function applyRequestCommand(
  session: RequestSession,
  command: RequestCommand,
): RequestSession {
  if (session.readOnly) throw new Error("This workspace is read-only.");
  if (command.kind !== "review") {
    const existing = session.requests.find(item => item.id === command.id);
    if (command.kind === "edit-draft" && (!existing || existing.stage !== "draft" || !session.clientIds.includes(existing.clientId)))
      throw new Error("Only a draft in this workspace can be edited.");
    if (command.kind === "draft" && existing)
      throw new Error("This draft already exists.");
    const draft = createDraft(
      command.clientId,
      command.title,
      command.description,
      session.clientIds,
      command.id,
    );
    return { ...session, requests: command.kind === "edit-draft"
      ? session.requests.map(item => item.id === draft.id ? draft : item)
      : [draft, ...session.requests] };
  }
  const request = session.requests.find((item) => item.id === command.id);
  if (!request || !session.clientIds.includes(request.clientId))
    throw new Error("This request is unavailable in this workspace.");
  if (request.stage !== "review")
    throw new Error("This request is not ready for review.");
  if (command.decision === "changes" && !command.feedback.trim())
    throw new Error("Describe what should change before saving your feedback.");
  if (command.feedback.length > 4000)
    throw new Error("Keep feedback within 4,000 characters.");
  const note =
    command.decision === "approve"
      ? "Review approved in this preview. Publishing still requires a separate decision."
      : command.feedback.trim();
  return {
    ...session,
    requests: session.requests.map((item) =>
      item.id === request.id ? { ...item, note } : item,
    ),
  };
}
