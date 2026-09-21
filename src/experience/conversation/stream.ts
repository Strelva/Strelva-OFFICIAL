/**
 * Decoder for Strelva's line-oriented conversation stream.
 *
 * Text deltas are streamed as plain text. Control events are reserved lines:
 * __TOOL__, __RESULT__, __TOOL_DONE__, and __CARD__. Keeping this wire decoder
 * outside a product route lets a future user conversation surface reuse the
 * transport without inheriting managed-site tools or tenant state.
 */

const STREAM_MARKERS = ["__TOOL__", "__RESULT__", "__TOOL_DONE__", "__CARD__"] as const;

export type ConversationStreamEvent<TResult = unknown, TCard = unknown> =
  | { type: "text"; text: string }
  | { type: "tool"; label: string }
  | { type: "result"; result: TResult | null }
  | { type: "tool-done" }
  | { type: "card"; card: TCard };

function couldBeMarkerLine(value: string): boolean {
  return value.length > 0 && STREAM_MARKERS.some(
    (marker) => marker.startsWith(value) || value.startsWith(marker)
  );
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Incrementally decodes UTF-8 chunks while retaining incomplete marker lines.
 *
 * Ordinary text is emitted immediately to preserve the existing typing feel.
 * A buffer is held only when it could still become a reserved marker; this is
 * what prevents a chunk ending in `__RES` from appearing in the assistant text.
 */
export class ConversationStreamDecoder<TResult = unknown, TCard = unknown> {
  private readonly textDecoder = new TextDecoder();
  private buffer = "";
  private lineStart = true;
  private finished = false;

  push(chunk: Uint8Array): ConversationStreamEvent<TResult, TCard>[] {
    if (this.finished || chunk.byteLength === 0) return [];
    this.buffer += this.textDecoder.decode(chunk, { stream: true });
    return this.drain(false);
  }

  finish(): ConversationStreamEvent<TResult, TCard>[] {
    if (this.finished) return [];
    this.finished = true;
    this.buffer += this.textDecoder.decode();
    return this.drain(true);
  }

  private drain(isFinal: boolean): ConversationStreamEvent<TResult, TCard>[] {
    const events: ConversationStreamEvent<TResult, TCard>[] = [];

    while (this.buffer) {
      const newline = this.buffer.indexOf("\n");
      if (newline >= 0) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        events.push(...(this.lineStart ? this.parseLine(line) : [this.textEvent(`${line}\n`)]));
        this.lineStart = true;
        continue;
      }

      // A complete marker line without its terminating newline may still be
      // completed by the next network chunk. Keep it intact until finish().
      // Markers are only meaningful at a line boundary, so marker-like prose
      // after already-emitted text remains prose regardless of chunking.
      if (this.lineStart && !isFinal && couldBeMarkerLine(this.buffer)) {
        break;
      }

      const remainder = this.buffer;
      this.buffer = "";
      events.push(...(this.lineStart ? this.parseLine(remainder, false) : [this.textEvent(remainder)]));
      this.lineStart = false;
    }

    return events;
  }

  private textEvent(text: string): ConversationStreamEvent<TResult, TCard> {
    return { type: "text", text };
  }

  private parseLine(
    line: string,
    hasTerminatingNewline = true
  ): ConversationStreamEvent<TResult, TCard>[] {
    if (line.startsWith("__TOOL__")) {
      return [{ type: "tool", label: line.slice("__TOOL__".length) }];
    }

    if (line.startsWith("__RESULT__")) {
      return [{ type: "result", result: parseJson<TResult>(line.slice("__RESULT__".length)) }];
    }

    if (line.startsWith("__TOOL_DONE__")) {
      return [{ type: "tool-done" }];
    }

    if (line.startsWith("__CARD__")) {
      const card = parseJson<TCard>(line.slice("__CARD__".length));
      return card === null ? [] : [{ type: "card", card }];
    }

    // Newline-delimited text gets its newline back. A trailing partial text
    // chunk does not, matching the stream before this decoder was extracted.
    return [{ type: "text", text: hasTerminatingNewline ? `${line}\n` : line }];
  }
}
