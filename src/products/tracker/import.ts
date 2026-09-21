import {
  TRACKER_IMPORT_LIMITS,
  TRACKER_IMPORT_VERSION,
  trackerImportInputSchema,
  trackerMappingSelectionSchema,
  TrackerImportError,
  type TrackerColumnMapping,
  type TrackerFieldKind,
  type TrackerImportInput,
  type TrackerImportLimits,
  type TrackerImportPreview,
  type TrackerImportSource,
  type TrackerImportedRow,
  type TrackerMappingConfidence,
  type TrackerMappingSelection,
  type TrackerMappingStatus,
  type TrackerSourceColumn,
  type TrackerWarning,
} from "./contracts";
import { parseTrackerCsv, type ParsedTrackerCsvRecord } from "./csv";

export interface TrackerImportOptions {
  limits?: Partial<TrackerImportLimits>;
}

export interface TrackerTypeInference {
  kind: TrackerFieldKind;
  ambiguous: boolean;
  invalidValues: number[];
}

const FIELD_ALIASES: Record<string, { key: string; kind?: TrackerFieldKind }> = {
  name: { key: "name", kind: "text" },
  full_name: { key: "name", kind: "text" },
  customer_name: { key: "name", kind: "text" },
  contact_name: { key: "name", kind: "text" },
  email: { key: "email", kind: "email" },
  email_address: { key: "email", kind: "email" },
  phone: { key: "phone", kind: "text" },
  phone_number: { key: "phone", kind: "text" },
  telephone: { key: "phone", kind: "text" },
  status: { key: "status", kind: "text" },
  state: { key: "status", kind: "text" },
  stage: { key: "status", kind: "text" },
  url: { key: "url", kind: "url" },
  website: { key: "url", kind: "url" },
  website_url: { key: "url", kind: "url" },
  date: { key: "date", kind: "date" },
  created_at: { key: "created_at", kind: "date" },
  updated_at: { key: "updated_at", kind: "date" },
  due_date: { key: "due_date", kind: "date" },
  amount: { key: "amount", kind: "number" },
  total: { key: "total", kind: "number" },
  count: { key: "count", kind: "number" },
  active: { key: "active", kind: "boolean" },
  enabled: { key: "enabled", kind: "boolean" },
};

const DATE_PATTERN = /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})(?:[ T].*)?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BOOLEAN_PATTERN = /^(?:true|false|yes|no)$/i;
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function boundedLimits(input: Partial<TrackerImportLimits> | undefined): TrackerImportLimits {
  const limits = { ...TRACKER_IMPORT_LIMITS, ...(input || {}) };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TrackerImportError("invalid_limits", `The ${key} import limit must be a positive whole number.`);
    }
    const hardLimit = TRACKER_IMPORT_LIMITS[key as keyof TrackerImportLimits];
    if (value > hardLimit) {
      throw new TrackerImportError("invalid_limits", `The ${key} import limit cannot exceed ${hardLimit}.`);
    }
  }
  return limits;
}

function normalizeFieldKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "";
}

function uniqueFieldKey(base: string, used: Set<string>, fallback: string): string {
  const candidate = normalizeFieldKey(base) || fallback;
  let key = candidate;
  let suffix = 2;
  while (used.has(key)) {
    key = `${candidate}_${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

function cleanHeader(value: string, index: number): string {
  const header = value.trim();
  return header || `Column ${index + 1}`;
}

function isNumber(value: string): boolean {
  return NUMBER_PATTERN.test(value.trim()) && Number.isFinite(Number(value));
}

function isDate(value: string): boolean {
  const trimmed = value.trim();
  return DATE_PATTERN.test(trimmed) && Number.isFinite(Date.parse(trimmed));
}

function isUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return false;
  try {
    const url = new URL(trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`);
    return Boolean(url.hostname.includes("."));
  } catch {
    return false;
  }
}

function candidateKinds(value: string): TrackerFieldKind[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const candidates: TrackerFieldKind[] = [];
  if (BOOLEAN_PATTERN.test(trimmed)) candidates.push("boolean");
  if (isNumber(trimmed)) candidates.push("number");
  if (isDate(trimmed)) candidates.push("date");
  if (EMAIL_PATTERN.test(trimmed)) candidates.push("email");
  if (isUrl(trimmed)) candidates.push("url");
  return candidates;
}

function matchesKind(value: string, kind: TrackerFieldKind): boolean {
  if (!value.trim()) return true;
  if (kind === "text") return true;
  return candidateKinds(value).includes(kind);
}

/** Infer a display-safe kind and retain ambiguity instead of coercing data. */
export function inferTrackerColumnType(values: readonly string[]): TrackerTypeInference {
  const nonEmpty = values.map((value, index) => ({ value, index })).filter(({ value }) => value.trim().length > 0);
  if (nonEmpty.length === 0) return { kind: "text", ambiguous: true, invalidValues: [] };

  const kinds = nonEmpty.map(({ value }) => candidateKinds(value));
  const possible = new Set(kinds.flat());
  const specialized = ["boolean", "number", "date", "email", "url"] as const;
  const consistent = specialized.filter((kind) => kinds.every((candidates) => candidates.includes(kind)));
  const [consistentKind] = consistent;
  if (consistent.length === 1 && consistentKind) {
    return { kind: consistentKind, ambiguous: false, invalidValues: [] };
  }

  const invalidValues = nonEmpty
    .filter(({ value }) => candidateKinds(value).length === 0)
    .map(({ index }) => index);

  // Ordinary prose has no specialized candidates and is a valid text column.
  // Only mark it ambiguous when the column also contains recognizable values
  // that conflict with the prose values.
  if (possible.size === 0) {
    return { kind: "text", ambiguous: false, invalidValues: [] };
  }

  // A column with a mix of recognizable types, or a partial specialized type,
  // stays text. The warning lets a reviewer choose a more specific mapping.
  return {
    kind: "text",
    ambiguous: possible.size > 0 || invalidValues.length > 0,
    invalidValues,
  };
}

function warning(
  source: TrackerImportSource,
  code: TrackerWarning["code"],
  severity: TrackerWarning["severity"],
  message: string,
  context: Partial<Pick<TrackerWarning, "sourceRow" | "sourceLineStart" | "sourceLineEnd" | "sourceColumn" | "sourceHeader">> = {},
): TrackerWarning {
  return { code, severity, message, sourceId: source.sourceId, ...context };
}

function sourceFor(input: TrackerImportInput, sizeBytes: number): TrackerImportSource {
  const originalFileName = input.fileName.trim();
  const sourceId = (input.sourceId?.trim() || `file:${originalFileName}`).slice(0, 200);
  return {
    sourceId,
    originalFileName,
    format: "csv",
    mediaType: "text/csv",
    sizeBytes,
  };
}

function validateFormat(input: TrackerImportInput): void {
  const fileName = input.fileName.trim().toLowerCase();
  const mimeType = input.mimeType?.split(";", 1)[0]?.trim().toLowerCase();
  const hasKnownNonCsvExtension = /\.(xlsx?|ods|xlsm|numbers|tsv)$/.test(fileName);
  const isCsv = fileName.endsWith(".csv") || mimeType === "text/csv";
  if (hasKnownNonCsvExtension || !isCsv) {
    throw new TrackerImportError(
      "unsupported_format",
      "Only CSV files are supported in this tracker import. Export the sheet as CSV and try again.",
    );
  }
}

function headerColumns(
  source: TrackerImportSource,
  values: readonly string[],
  limits: TrackerImportLimits,
): { headers: TrackerSourceColumn[]; warnings: TrackerWarning[] } {
  const headers: TrackerSourceColumn[] = [];
  const warnings: TrackerWarning[] = [];
  const seen = new Map<string, TrackerSourceColumn>();

  values.forEach((value, index) => {
    const trimmed = value.trim();
    const normalizedHeader = normalizeFieldKey(trimmed);
    const id = `column_${index + 1}`;
    const header: TrackerSourceColumn = {
      id,
      sourceColumn: index + 1,
      sourceColumnIndex: index,
      header: value,
      normalizedHeader,
    };
    if (!trimmed) {
      warnings.push(warning(source, "empty_header", "warning", `Column ${index + 1} has no header. Choose a field name before creating the tracker.`, {
        sourceColumn: index + 1,
      }));
    } else if (trimmed.length > limits.maxHeaderCharacters) {
      warnings.push(warning(source, "limit_exceeded", "error", `Column ${index + 1} exceeds the ${limits.maxHeaderCharacters}-character header limit.`, {
        sourceColumn: index + 1,
        sourceHeader: value,
      }));
    }
    if (normalizedHeader) {
      const first = seen.get(normalizedHeader);
      if (first) {
        header.duplicateOf = first.id;
        warnings.push(warning(source, "duplicate_header", "warning", `Column ${index + 1} repeats the header “${value.trim()}”. It remains separate until you choose how to label it.`, {
          sourceColumn: index + 1,
          sourceHeader: value,
        }));
      } else {
        seen.set(normalizedHeader, header);
      }
    }
    headers.push(header);
  });

  return { headers, warnings };
}

function rowWarningContext(record: ParsedTrackerCsvRecord, column?: number) {
  return {
    sourceRow: record.sourceRow,
    sourceLineStart: record.sourceLineStart,
    sourceLineEnd: record.sourceLineEnd,
    ...(column === undefined ? {} : { sourceColumn: column }),
  };
}

function emptyPreview(source: TrackerImportSource, originalSource: string, warningItems: TrackerWarning[]): TrackerImportPreview {
  return {
    version: TRACKER_IMPORT_VERSION,
    previewId: `tracker-import:${source.sourceId}`,
    source,
    originalSource,
    headers: [],
    rows: [],
    mapping: [],
    warnings: warningItems,
    validation: {
      status: "invalid",
      valid: false,
      canCreate: false,
      rowCount: 0,
      columnCount: 0,
      sizeBytes: source.sizeBytes,
      errors: warningItems.filter((item) => item.severity === "error"),
      warnings: warningItems.filter((item) => item.severity === "warning"),
    },
  };
}

function buildMapping(
  source: TrackerImportSource,
  headers: readonly TrackerSourceColumn[],
  records: readonly ParsedTrackerCsvRecord[],
  warnings: TrackerWarning[],
): TrackerColumnMapping[] {
  const usedKeys = new Set<string>();
  return headers.map((header, headerIndex) => {
    const values = records.map((record) => record.values[headerIndex] || "");
    const inference = inferTrackerColumnType(values);
    const alias = header.normalizedHeader ? FIELD_ALIASES[header.normalizedHeader] : undefined;
    const defaultKey = alias?.key || header.normalizedHeader || `column_${header.sourceColumn}`;
    const targetFieldKey = uniqueFieldKey(defaultKey, usedKeys, `column_${header.sourceColumn}`);
    const targetKind = alias?.kind || inference.kind;
    const isBlank = header.normalizedHeader.length === 0;
    const confidence: TrackerMappingConfidence = alias
      ? "high"
      : isBlank
        ? "none"
        : "medium";
    const status: TrackerMappingStatus = isBlank ? "unmapped" : alias ? "accepted" : "proposed";
    if (inference.ambiguous && values.some((value) => value.trim())) {
      warnings.push(warning(source, "ambiguous_type", "warning", `Column “${cleanHeader(header.header, headerIndex)}” contains values that do not share one clear type. It is kept as text until reviewed.`, {
        sourceColumn: header.sourceColumn,
        sourceHeader: header.header,
      }));
    }
    if (alias?.kind && alias.kind !== "text") {
      for (const [valueIndex, value] of values.entries()) {
        const record = records[valueIndex];
        if (!record || !value.trim() || matchesKind(value, alias.kind)) continue;
        warnings.push(warning(source, "invalid_value", "warning", `The value in “${cleanHeader(header.header, headerIndex)}” is not a valid ${alias.kind} and will remain unchanged.`, {
          ...rowWarningContext(record, header.sourceColumn),
          sourceHeader: header.header,
        }));
      }
    }
    for (const valueIndex of inference.invalidValues) {
      const record = records[valueIndex];
      const value = record?.values[headerIndex] || "";
      if (!record || !value.trim()) continue;
      warnings.push(warning(source, "invalid_value", "warning", `The value in “${cleanHeader(header.header, headerIndex)}” is not valid for a single inferred type and will remain unchanged.`, {
        ...rowWarningContext(record, header.sourceColumn),
        sourceHeader: header.header,
      }));
    }
    if (isBlank) {
      warnings.push(warning(source, "unmapped_column", "warning", `Column ${header.sourceColumn} needs a field name before creation.`, {
        sourceColumn: header.sourceColumn,
      }));
    }
    return {
      sourceColumnId: header.id,
      sourceColumn: header.sourceColumn,
      sourceHeader: header.header,
      targetFieldKey,
      targetLabel: cleanHeader(header.header, headerIndex),
      targetKind,
      confidence,
      status,
      reason: alias
        ? "Matched a known field name."
        : isBlank
          ? "No source header was supplied."
          : "Derived from the source header; review the proposed field name.",
    };
  });
}

function buildRows(
  source: TrackerImportSource,
  headers: readonly TrackerSourceColumn[],
  records: readonly ParsedTrackerCsvRecord[],
  warnings: TrackerWarning[],
  limits: TrackerImportLimits,
): TrackerImportedRow[] {
  return records.slice(0, limits.maxRows).map((record, rowIndex) => {
    const values: Record<string, string> = {};
    for (const [headerIndex, header] of headers.entries()) {
      const value = record.values[headerIndex] || "";
      values[header.id] = value;
      if (value.length > limits.maxCellCharacters) {
        warnings.push(warning(source, "limit_exceeded", "error", `The value in row ${record.sourceRow}, column ${header.sourceColumn} exceeds the ${limits.maxCellCharacters}-character cell limit.`, {
          ...rowWarningContext(record, header.sourceColumn),
          sourceHeader: header.header,
        }));
      }
      if (value.trimStart().startsWith("=")) {
        warnings.push(warning(source, "unsupported_formula", "warning", `The value in row ${record.sourceRow}, column ${header.sourceColumn} looks like a formula. Tracker import keeps the formula text and does not calculate it.`, {
          ...rowWarningContext(record, header.sourceColumn),
          sourceHeader: header.header,
        }));
      }
    }
    if (record.values.length !== headers.length) {
      warnings.push(warning(source, "row_width", "error", `Row ${record.sourceRow} has ${record.values.length} values but the header has ${headers.length} columns.`, rowWarningContext(record)));
    }
    return {
      id: `${source.sourceId}:row:${record.sourceRow}`,
      sourceRow: record.sourceRow,
      sourceDataRow: rowIndex + 1,
      sourceLineStart: record.sourceLineStart,
      sourceLineEnd: record.sourceLineEnd,
      values,
      rawValues: [...record.values],
      lineage: {
        sourceId: source.sourceId,
        sourceName: source.originalFileName,
        sourceRow: record.sourceRow,
        sourceLineStart: record.sourceLineStart,
        sourceLineEnd: record.sourceLineEnd,
      },
    };
  });
}

function withValidation(preview: Omit<TrackerImportPreview, "validation">): TrackerImportPreview {
  const errors = preview.warnings.filter((item) => item.severity === "error");
  const warningItems = preview.warnings.filter((item) => item.severity === "warning");
  const valid = errors.length === 0;
  const mapped = preview.mapping.every((item) => item.status !== "ambiguous" && item.status !== "unmapped");
  const canCreate = valid && mapped;
  return {
    ...preview,
    validation: {
      status: !valid ? "invalid" : !canCreate || warningItems.length > 0 ? "needs_attention" : "ready",
      valid,
      canCreate,
      rowCount: preview.rows.length,
      columnCount: preview.headers.length,
      sizeBytes: preview.source.sizeBytes,
      errors,
      warnings: warningItems,
    },
  };
}

/** Build a reviewable import preview. No tracker is persisted by this function. */
export function previewTrackerImport(
  input: TrackerImportInput,
  options: TrackerImportOptions = {},
): TrackerImportPreview {
  const parsed = trackerImportInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new TrackerImportError("invalid_input", "Provide a CSV file name and text content for the tracker import.");
  }
  const validatedInput = parsed.data;
  validateFormat(validatedInput);
  const limits = boundedLimits(options.limits);
  const sizeBytes = utf8ByteLength(validatedInput.content);
  const source = sourceFor(validatedInput, sizeBytes);

  if (sizeBytes > limits.maxBytes) {
    return emptyPreview(source, validatedInput.content, [warning(source, "limit_exceeded", "error", `This CSV is ${sizeBytes} bytes; the import limit is ${limits.maxBytes} bytes.`)]);
  }

  const parsedCsv = parseTrackerCsv(validatedInput.content, { sourceId: source.sourceId });
  const warnings = [...parsedCsv.warnings];
  if (parsedCsv.records.length === 0) {
    return emptyPreview(source, validatedInput.content, [
      ...warnings,
      warning(source, "malformed_csv", "error", "The CSV does not contain a header row."),
    ]);
  }

  const headerRecord = parsedCsv.records[0]!;
  if (headerRecord.values.length === 0 || headerRecord.values.length > limits.maxColumns) {
    warnings.push(warning(source, "limit_exceeded", "error", `This CSV has ${headerRecord.values.length} columns; the import limit is ${limits.maxColumns}.`, {
      sourceRow: headerRecord.sourceRow,
      sourceLineStart: headerRecord.sourceLineStart,
      sourceLineEnd: headerRecord.sourceLineEnd,
    }));
  }
  const columnResult = headerColumns(source, headerRecord.values.slice(0, limits.maxColumns), limits);
  warnings.push(...columnResult.warnings);

  const dataRecords = parsedCsv.records.slice(1);
  if (dataRecords.length > limits.maxRows) {
    warnings.push(warning(source, "limit_exceeded", "error", `This CSV has ${dataRecords.length} data rows; the import limit is ${limits.maxRows}.`));
  }
  const rows = buildRows(source, columnResult.headers, dataRecords, warnings, limits);
  const mapping = buildMapping(source, columnResult.headers, dataRecords, warnings);
  return withValidation({
    version: TRACKER_IMPORT_VERSION,
    previewId: `tracker-import:${source.sourceId}`,
    source,
    originalSource: validatedInput.content,
    headers: columnResult.headers,
    rows,
    mapping,
    warnings,
  });
}

/** Alias named for callers that prefer the noun-first form. */
export const createTrackerImportPreview = previewTrackerImport;

function normalizedSelection(selection: TrackerMappingSelection): TrackerMappingSelection {
  const parsed = trackerMappingSelectionSchema.safeParse(selection);
  if (!parsed.success) throw new TrackerImportError("invalid_mapping", "Each field mapping needs a source column and field name.");
  const targetFieldKey = normalizeFieldKey(parsed.data.targetFieldKey);
  if (!targetFieldKey) throw new TrackerImportError("invalid_mapping", "A tracker field name must contain a letter or number.");
  return { ...parsed.data, targetFieldKey };
}

/** Apply explicit field choices without changing source rows or warnings. */
export function applyTrackerMapping(
  preview: TrackerImportPreview,
  selections: readonly TrackerMappingSelection[],
): TrackerImportPreview {
  const normalized = selections.map(normalizedSelection);
  const byColumn = new Map(preview.headers.map((header) => [header.id, header]));
  const bySelection = new Map<string, TrackerMappingSelection>();
  const usedTargets = new Set<string>();
  for (const selection of normalized) {
    if (!byColumn.has(selection.sourceColumnId)) {
      throw new TrackerImportError("invalid_mapping", `The source column ${selection.sourceColumnId} is not in this preview.`);
    }
    if (bySelection.has(selection.sourceColumnId)) {
      throw new TrackerImportError("invalid_mapping", `The source column ${selection.sourceColumnId} was mapped more than once.`);
    }
    if (usedTargets.has(selection.targetFieldKey)) {
      throw new TrackerImportError("invalid_mapping", `The tracker field ${selection.targetFieldKey} is assigned more than once.`);
    }
    bySelection.set(selection.sourceColumnId, selection);
    usedTargets.add(selection.targetFieldKey);
  }

  const mapping = preview.mapping.map((item) => {
    const selection = bySelection.get(item.sourceColumnId);
    if (!selection) return { ...item };
    const header = byColumn.get(item.sourceColumnId)!;
    return {
      ...item,
      targetFieldKey: selection.targetFieldKey,
      targetLabel: selection.targetLabel || cleanHeader(header.header, header.sourceColumnIndex),
      targetKind: selection.targetKind || item.targetKind,
      confidence: "high" as const,
      status: "accepted" as const,
      reason: "Chosen by the reviewer.",
    };
  });
  const targetKeys = new Set<string>();
  for (const item of mapping) {
    if (targetKeys.has(item.targetFieldKey)) {
      throw new TrackerImportError("invalid_mapping", `The tracker field ${item.targetFieldKey} is assigned more than once.`);
    }
    targetKeys.add(item.targetFieldKey);
  }
  const warnings = preview.warnings.filter((item) => {
    if (item.code !== "unmapped_column" || item.sourceColumn === undefined) return true;
    return !normalized.some((selection) => {
      const header = byColumn.get(selection.sourceColumnId);
      return header?.sourceColumn === item.sourceColumn;
    });
  });
  return withValidation({ ...clone(preview), mapping, warnings });
}

/** A small helper for hosts that want to validate an explicit selection first. */
export function validateTrackerMappingSelection(value: unknown): TrackerMappingSelection {
  return normalizedSelection(value as TrackerMappingSelection);
}
