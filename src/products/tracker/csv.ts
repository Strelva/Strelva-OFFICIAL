import type { TrackerWarning } from "./contracts";

export interface ParsedTrackerCsvRecord {
  values: string[];
  /** One-based CSV record number. */
  sourceRow: number;
  sourceLineStart: number;
  sourceLineEnd: number;
}

export interface TrackerCsvParseResult {
  records: ParsedTrackerCsvRecord[];
  warnings: TrackerWarning[];
}

function warning(
  sourceId: string,
  sourceRow: number,
  sourceLineStart: number,
  sourceLineEnd: number,
  message: string,
  sourceColumn?: number,
): TrackerWarning {
  return {
    code: "malformed_csv",
    severity: "error",
    message,
    sourceId,
    sourceRow,
    sourceLineStart,
    sourceLineEnd,
    ...(sourceColumn === undefined ? {} : { sourceColumn }),
  };
}

function lineBreakLength(content: string, index: number): number {
  if (content[index] === "\r" && content[index + 1] === "\n") return 2;
  return 1;
}

/**
 * Parse RFC 4180-style CSV without a dependency. Quoted commas, escaped quotes,
 * CRLF, and newlines inside quoted fields are preserved. Malformed records are
 * returned with an error warning so a preview can show what needs attention;
 * callers must check the preview validation before creating a tracker.
 */
export function parseTrackerCsv(
  content: string,
  options: { sourceId?: string } = {},
): TrackerCsvParseResult {
  const sourceId = options.sourceId || "csv-source";
  const input = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const records: ParsedTrackerCsvRecord[] = [];
  const warnings: TrackerWarning[] = [];

  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;
  let line = 1;
  let recordStartLine = 1;
  let recordNumber = 1;
  let hasRecordContent = false;

  const pushField = () => {
    fields.push(field);
    field = "";
    closedQuote = false;
  };

  const pushRecord = (lineEnd: number) => {
    pushField();
    records.push({
      values: fields,
      sourceRow: recordNumber,
      sourceLineStart: recordStartLine,
      sourceLineEnd: lineEnd,
    });
    fields = [];
    recordNumber += 1;
    recordStartLine = lineEnd + 1;
    hasRecordContent = false;
  };

  let index = 0;
  while (index < input.length) {
    const character = input[index];

    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          hasRecordContent = true;
          index += 2;
          continue;
        }
        inQuotes = false;
        closedQuote = true;
        hasRecordContent = true;
        index += 1;
        continue;
      }

      if (character === "\r" || character === "\n") {
        const length = lineBreakLength(input, index);
        field += input.slice(index, index + length);
        line += 1;
        index += length;
        hasRecordContent = true;
        continue;
      }

      field += character;
      hasRecordContent = true;
      index += 1;
      continue;
    }

    if (character === '"') {
      if (field.length === 0 && !closedQuote) {
        inQuotes = true;
        hasRecordContent = true;
      } else {
        warnings.push(warning(
          sourceId,
          recordNumber,
          recordStartLine,
          line,
          "A quote appeared inside an unquoted CSV field.",
          fields.length + 1,
        ));
        field += character;
        hasRecordContent = true;
      }
      index += 1;
      continue;
    }

    if (character === ",") {
      if (closedQuote) closedQuote = false;
      pushField();
      hasRecordContent = true;
      index += 1;
      continue;
    }

    if (character === "\r" || character === "\n") {
      const length = lineBreakLength(input, index);
      pushRecord(line);
      line += 1;
      index += length;
      continue;
    }

    if (closedQuote) {
      warnings.push(warning(
        sourceId,
        recordNumber,
        recordStartLine,
        line,
        "Characters after a closing quote must be followed by a comma or line break.",
        fields.length + 1,
      ));
      closedQuote = false;
    }
    field += character;
    hasRecordContent = true;
    index += 1;
  }

  if (inQuotes) {
    warnings.push(warning(
      sourceId,
      recordNumber,
      recordStartLine,
      line,
      "The CSV contains an unterminated quoted field.",
      fields.length + 1,
    ));
  }

  // A newline already commits the final record. Do not append a phantom empty
  // record for the common trailing-newline case.
  if (fields.length > 0 || field.length > 0 || hasRecordContent || input.endsWith(",")) {
    pushRecord(line);
  }

  return { records, warnings };
}
