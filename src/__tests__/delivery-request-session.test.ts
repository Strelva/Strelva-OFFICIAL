import { describe, expect, it } from "vitest";
import {
  applyRequestCommand,
  beginRequestSession,
} from "@/experience/delivery/request-session";

import { beginPreviewSession } from "@/experience/delivery/preview-fixture";

describe("shared implementation request session", () => {
  it("accepts explicit resource scope independently of audience labels", () => {
    const session = beginRequestSession({
      clientIds: ["business-42"],
      readOnly: false,
      requests: [],
    });
    expect(
      applyRequestCommand(session, {
        kind: "draft",
        id: "new",
        clientId: "business-42",
        title: "Booking",
        description: "Request a time",
      }).requests[0]?.clientId,
    ).toBe("business-42");
    expect(() =>
      beginRequestSession({
        ...session,
        requests: [
          {
            id: "foreign",
            clientId: "business-99",
            title: "Foreign",
            description: "Hidden",
            stage: "review",
          },
        ],
      }),
    ).toThrow("do not match");
  });

  it("supports both audiences through the same draft command without submitting", () => {
    for (const audience of ["agency", "client"] as const) {
      const original = beginPreviewSession(audience);
      const next = applyRequestCommand(original, {
        kind: "draft",
        id: "draft-1",
        clientId: "harbor",
        title: " Website ",
        description: " Make appointments easier. ",
      });
      expect(next.requests[0]).toMatchObject({
        title: "Website",
        description: "Make appointments easier.",
        stage: "draft",
        clientId: "harbor",
      });
      expect(original.requests.some((item) => item.id === "draft-1")).toBe(
        false,
      );
    }
  });
  it("keeps direct customer requests within their business", () => {
    const session = beginPreviewSession("client");
    expect(session.requests.every((item) => item.clientId === "harbor")).toBe(
      true,
    );
    expect(() =>
      applyRequestCommand(session, {
        kind: "draft",
        id: "x",
        clientId: "north",
        title: "Site",
        description: "Build it",
      }),
    ).toThrow("Choose a client");
    expect(() =>
      applyRequestCommand(session, {
        kind: "review",
        id: "finder",
        decision: "approve",
        feedback: "",
      }),
    ).toThrow("unavailable");
  });
  it("rejects read-only mutations, empty drafts, unknown clients, and duplicate identifiers", () => {
    const command = {
      kind: "draft" as const,
      id: "intake",
      clientId: "harbor",
      title: "Site",
      description: "Build it",
    };
    expect(() =>
      applyRequestCommand(
        beginPreviewSession("agency", { readOnly: true }),
        command,
      ),
    ).toThrow("read-only");
    expect(() =>
      applyRequestCommand(beginPreviewSession("agency"), command),
    ).toThrow("already exists");
    expect(() =>
      applyRequestCommand(beginPreviewSession("agency"), {
        ...command,
        id: "x",
        title: " ",
      }),
    ).toThrow("Add a title");
    expect(() =>
      applyRequestCommand(beginPreviewSession("agency"), {
        ...command,
        id: "x",
        clientId: "unknown",
      }),
    ).toThrow("Choose a client");
  });
  it("requires actionable change feedback and does not turn a review into publication", () => {
    const session = beginPreviewSession("agency");
    expect(() =>
      applyRequestCommand(session, {
        kind: "review",
        id: "projects",
        decision: "approve",
        feedback: "",
      }),
    ).toThrow("not ready");
    expect(() =>
      applyRequestCommand(session, {
        kind: "review",
        id: "intake",
        decision: "changes",
        feedback: " ",
      }),
    ).toThrow("Describe");
    const next = applyRequestCommand(session, {
      kind: "review",
      id: "intake",
      decision: "approve",
      feedback: "",
    });
    expect(next.requests.find((item) => item.id === "intake")).toMatchObject({
      stage: "review",
      note: expect.stringContaining("Publishing still requires"),
    });
    expect(
      session.requests.find((item) => item.id === "intake")?.note,
    ).toBeUndefined();
  });
});
