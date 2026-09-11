import { describe, expect, it } from "vitest";
import { restoreLocalSession, serializeLocalSession } from "@/experience/delivery/local-store";
import { beginPreviewSession } from "@/experience/delivery/preview-fixture";
import { applyRequestCommand } from "@/experience/delivery/request-session";

describe("local delivery review", () => {
  it("retains edits without creating another request", () => {
    const baseline = beginPreviewSession("client", {});
    const command = { kind: "draft" as const, id: "local-1", clientId: "harbor", title: "Booking", description: "Book a visit" };
    const created = applyRequestCommand(baseline, command);
    const edited = applyRequestCommand(created, { ...command, kind: "edit-draft", description: "Choose a time and book a visit" });
    const restored = restoreLocalSession(serializeLocalSession(edited), baseline);
    expect(restored.requests).toHaveLength(baseline.requests.length + 1);
    expect(restored.requests[0]?.description).toBe("Choose a time and book a visit");
  });
  it("rejects corrupt, duplicate, or out-of-scope stored records", () => {
    const client = beginPreviewSession("client", {});
    expect(() => restoreLocalSession("{", client)).toThrow();
    expect(() => restoreLocalSession(serializeLocalSession(beginPreviewSession("agency", {})), client)).toThrow();
    expect(() => restoreLocalSession(JSON.stringify({ version: 1, requests: [client.requests[0], client.requests[0]] }), client)).toThrow();
  });
  it("cannot edit implementation or read-only records", () => {
    const session = beginPreviewSession("client", {});
    const command = { kind: "edit-draft" as const, id: session.requests[0]!.id, clientId: "harbor", title: "Changed", description: "Changed" };
    expect(() => applyRequestCommand(session, command)).toThrow("Only a draft");
    expect(() => applyRequestCommand({ ...session, readOnly: true }, command)).toThrow("read-only");
  });
});
