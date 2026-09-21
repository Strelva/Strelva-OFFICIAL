import { describe, expect, it } from "vitest";
import { ConversationStreamDecoder, type ConversationStreamEvent } from "@/experience/conversation/stream";

function decodeChunks(chunks: Uint8Array[]): ConversationStreamEvent[] {
  const decoder = new ConversationStreamDecoder();
  return chunks.flatMap((chunk) => decoder.push(chunk)).concat(decoder.finish());
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function splitEveryByte(value: string): Uint8Array[] {
  const bytes = encode(value);
  return Array.from({ length: bytes.length }, (_, index) => bytes.slice(index, index + 1));
}

function normalize(events: ConversationStreamEvent[]): ConversationStreamEvent[] {
  return events.reduce<ConversationStreamEvent[]>((normalized, event) => {
    const previous = normalized[normalized.length - 1];
    if (previous?.type === "text" && event.type === "text") {
      normalized[normalized.length - 1] = { type: "text", text: previous.text + event.text };
    } else {
      normalized.push(event);
    }
    return normalized;
  }, []);
}

describe("ConversationStreamDecoder", () => {
  it("preserves text and newline semantics across chunks", () => {
    const events = decodeChunks([encode("Hello"), encode(" world\nNext")]);

    expect(events).toEqual([
      { type: "text", text: "Hello" },
      { type: "text", text: " world\n" },
      { type: "text", text: "Next" },
    ]);
  });

  it("decodes markers when every UTF-8 byte arrives separately", () => {
    const events = decodeChunks(
      splitEveryByte(
        "Visible\n__TOOL__Reading your site...\n__CARD__{\"__inlineTool\":\"show_report\"}\n__RESULT__{\"status\":\"applied\"}\n__TOOL_DONE__\n"
      )
    );

    expect(events.filter((event) => event.type === "text").map((event) => event.type === "text" ? event.text : "").join(""))
      .toBe("Visible\n");
    expect(events.filter((event) => event.type !== "text")).toEqual([
      { type: "tool", label: "Reading your site..." },
      { type: "card", card: { __inlineTool: "show_report" } },
      { type: "result", result: { status: "applied" } },
      { type: "tool-done" },
    ]);
  });

  it("does not leak a split result marker into assistant text", () => {
    const events = decodeChunks([
      encode("Answer\n__RES"),
      encode("ULT__{\"ok\":true}\nDone"),
    ]);

    expect(events).toEqual([
      { type: "text", text: "Answer\n" },
      { type: "result", result: { ok: true } },
      { type: "text", text: "Done" },
    ]);
    expect(events.map((event) => event.type === "text" ? event.text : "").join(""))
      .not.toContain("__RESULT__");
  });

  it("is partition-invariant and keeps marker-like prose mid-line as text", () => {
    const stream = [
      'hello __RESULT__{"x":1}\n',
      "Real text\n",
      "__TOOL__Reading your site...\n",
      "Prose with __CARD__not a card\n",
      '__CARD__{"__inlineTool":"show_report"}\n',
      '__RESULT__{"ok":true}\n',
      "__TOOL_DONE__\n",
      "tail",
    ].join("");
    const expected = normalize(decodeChunks([encode(stream)]));

    for (let split = 1; split < stream.length; split += 1) {
      expect(
        normalize(decodeChunks([encode(stream.slice(0, split)), encode(stream.slice(split))]))
      ).toEqual(expected);
    }
  });

  it("flushes an unterminated marker at EOF and makes finish idempotent", () => {
    const decoder = new ConversationStreamDecoder<{ ok: boolean }>();
    const events = [
      ...decoder.push(encode("Answer\n__RESULT__")),
      ...decoder.push(encode('{"ok":true}')),
      ...decoder.finish(),
      ...decoder.finish(),
    ];

    expect(events).toEqual([
      { type: "text", text: "Answer\n" },
      { type: "result", result: { ok: true } },
    ]);
  });

  it("flushes a split UTF-8 character without replacement text", () => {
    const bytes = encode("caf\u00e9");
    const events = decodeChunks([bytes.slice(0, -1), bytes.slice(-1)]);

    expect(events.filter((event) => event.type === "text").map((event) => event.type === "text" ? event.text : "").join(""))
      .toBe("café");
  });

  it("drops malformed JSON cards but keeps malformed results non-visible", () => {
    const events = decodeChunks([
      encode('__CARD__{"broken"}\n__RESULT__{"broken"}\nVisible'),
    ]);

    expect(events).toEqual([
      { type: "result", result: null },
      { type: "text", text: "Visible" },
    ]);
  });
});
