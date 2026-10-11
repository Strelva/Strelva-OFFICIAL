// Bounded catalog provider fixture layered over the existing local mail sink.
// A generated plan here proves the transport/validation journey, not model quality.
import "./local-provider.mjs";
if (process.env.STRELVA_LOCAL_CATALOG_PROOF !== "1") throw new Error("Catalog provider fixture requires explicit local opt-in.");
const mailAndLoopbackFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname !== "generativelanguage.googleapis.com") return mailAndLoopbackFetch(input, init);
  if (!url.pathname.endsWith(":generateContent")) throw new Error("Unsupported catalog model fixture operation.");
  if (String(init?.body || "").includes("local-catalog-fail")) return new Response(JSON.stringify({ error: { code: 503, message: "Local catalog provider unavailable", status: "UNAVAILABLE" } }), { status: 503, headers: { "Content-Type": "application/json" } });
  const plan = { status: "ready", summary: "Track bookkeeping clients and who handles them.", proposedOutputs: [{ id: "intake", title: "Bookkeeping intake", description: "A private client form and list", outcome: "capability", nativeOperationIds: ["create_application"], draft: {
    kind: "application", title: "Bookkeeping intake", fields: [
      { id: "business", label: "Client business", type: "text", required: true },
      { id: "client", label: "Client contact", type: "contact", required: true },
      { id: "handler", label: "Assigned person", type: "assigned_person", required: false },
      { id: "statements", label: "Bank statements", type: "boolean", required: false }],
    components: [{ kind: "form", fields: ["business", "client", "handler", "statements"] }, { kind: "list", fields: ["business", "client", "handler", "statements"] }]
  } }], steps: [], neededInputs: [], supportedNativeOperationIds: ["create_application"], requiredDecisions: [] };
  return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(plan) }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 100, totalTokenCount: 200 }, modelVersion: "gemini-2.5-flash", responseId: "local-catalog-plan" }),
    { status: 200, headers: { "Content-Type": "application/json" } });
};
