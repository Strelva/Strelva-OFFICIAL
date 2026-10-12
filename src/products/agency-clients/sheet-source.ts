import { z } from "zod";
import { parseTrackerCsv } from "@/products/tracker/index";
import {
  CLIENT_IMPORT_MAX_ROWS,
  clientImportRowSchema,
  type ClientImportPreviewRow,
  type ClientImportRow,
  type ClientImportSourceAdapter,
} from "./import-contract";

/**
 * The sheet source for Import clients: a CSV or TSV file, or a range pasted
 * from Google Sheets or Excel (tab-separated). It reads the agency's own list
 * into import rows with the tracker's CSV parser; it adds nothing. Runs in the
 * browser (for the column choice) and on the server (the adapter).
 */

export const CLIENT_SHEET_FIELDS = ["name", "url", "ownerEmail", "phone", "address"] as const;
export type ClientSheetField = (typeof CLIENT_SHEET_FIELDS)[number];
/** Which column (zero-based) feeds each field. A field without a column is left empty. */
export type ClientSheetMapping = Partial<Record<ClientSheetField, number>>;

export const CLIENT_SHEET_FIELD_LABELS: Record<ClientSheetField, string> = {
  name: "Business name",
  url: "Website",
  ownerEmail: "Owner’s email",
  phone: "Phone",
  address: "Address",
};

export const CLIENT_SHEET_MAX_BYTES = 1_000_000;

export interface ParsedClientSheet {
  delimiter: "," | "\t" | ";";
  /** True when the first row named its columns. A plain list of websites has no header. */
  hasHeader: boolean;
  headers: string[];
  records: Array<{ sourceRow: number; values: string[] }>;
  /** Plain-language problems with the file itself. */
  problems: string[];
}

function detectDelimiter(text: string): ParsedClientSheet["delimiter"] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(";") && !firstLine.includes(",")) return ";";
  return ",";
}

const URLISH = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;
const EMAILISH = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function looksLikeData(values: string[]): boolean {
  return values.some((value) => URLISH.test(value.trim()) || EMAILISH.test(value.trim()));
}

/** Read the text of a sheet. Blank rows are skipped. */
export function parseClientSheet(text: string, options: { delimiter?: ParsedClientSheet["delimiter"] } = {}): ParsedClientSheet {
  const delimiter = options.delimiter ?? detectDelimiter(text.replace(/^﻿/, ""));
  const problems: string[] = [];
  if (new TextEncoder().encode(text).length > CLIENT_SHEET_MAX_BYTES) {
    return { delimiter, hasHeader: false, headers: [], records: [], problems: ["This file is larger than 1 MB. Split it and import each part."] };
  }
  const parsed = parseTrackerCsv(text, { sourceId: "client-sheet", delimiter });
  if (parsed.warnings.length) problems.push(`Some rows have stray quotes (first at row ${parsed.warnings[0]!.sourceRow}). Check those rows in the preview.`);
  const rows = parsed.records
    .map((record) => ({ sourceRow: record.sourceRow, values: record.values.map((value) => value.trim()) }))
    .filter((record) => record.values.some(Boolean));
  if (!rows.length) return { delimiter, hasHeader: false, headers: [], records: [], problems: [...problems, "There are no rows to import."] };
  const width = Math.max(...rows.map((row) => row.values.length));
  const first = rows[0]!;
  const hasHeader = !looksLikeData(first.values);
  const headers = hasHeader
    ? Array.from({ length: width }, (_, index) => first.values[index] || `Column ${index + 1}`)
    : Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
  const records = hasHeader ? rows.slice(1) : rows;
  if (records.length > CLIENT_IMPORT_MAX_ROWS) problems.push(`This list has ${records.length} rows; one import takes up to ${CLIENT_IMPORT_MAX_ROWS}. Only the first ${CLIENT_IMPORT_MAX_ROWS} are shown.`);
  return { delimiter, hasHeader, headers, records: records.slice(0, CLIENT_IMPORT_MAX_ROWS), problems };
}

const key = (header: string) => header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Header words for each field, strongest first. Person-name columns never become the business name. */
const HEADER_RULES: Array<[ClientSheetField, RegExp]> = [
  ["url", /^(website|website url|web site|site|url|domain|homepage|web)$/],
  ["url", /\b(website|url|domain)\b/],
  ["ownerEmail", /^(owner email|owner e mail|email|e mail|email address|contact email|client email|business email)$/],
  ["ownerEmail", /\b(email|e mail)\b/],
  ["phone", /^(phone|phone number|telephone|tel|business phone|main phone|mobile|cell)$/],
  ["phone", /\b(phone|telephone|mobile)\b/],
  ["address", /^(address|street address|full address|business address|location address|address 1|address line 1)$/],
  ["address", /\baddress\b/],
  ["name", /^(business|business name|company|company name|client|client name|account|account name|location name|organization|organisation|name)$/],
  ["name", /\b(business|company|client|account)\b/],
];
const PERSON = /\b(first|last|owner|contact|person|full)\s+name\b|^(first|last)$/;

/** Sensible columns for each field from the headers, or from what the rows hold when there is no header. */
export function detectClientSheetColumns(sheet: Pick<ParsedClientSheet, "headers" | "records" | "hasHeader">): ClientSheetMapping {
  const mapping: ClientSheetMapping = {};
  const used = new Set<number>();
  if (sheet.hasHeader) {
    for (const [field, rule] of HEADER_RULES) {
      if (mapping[field] !== undefined) continue;
      const index = sheet.headers.findIndex((header, column) => !used.has(column) && rule.test(key(header)) && !(field === "name" && PERSON.test(key(header))));
      if (index >= 0) { mapping[field] = index; used.add(index); }
    }
  }
  // Fill website and email from content when the header did not say.
  const sample = sheet.records.slice(0, 20);
  const share = (column: number, test: RegExp) => {
    const values = sample.map((record) => record.values[column] ?? "").filter(Boolean);
    return values.length ? values.filter((value) => test.test(value)).length / values.length : 0;
  };
  for (const [field, test] of [["url", URLISH], ["ownerEmail", EMAILISH]] as const) {
    if (mapping[field] !== undefined) continue;
    const index = sheet.headers.findIndex((_, column) => !used.has(column) && share(column, test) >= 0.6 && !(field === "url" && share(column, EMAILISH) > 0));
    if (index >= 0) { mapping[field] = index; used.add(index); }
  }
  return mapping;
}

function siteRef(raw: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".")) return null;
    return `site:${host}${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return null;
  }
}

/**
 * The source ref for a sheet row: its website when it has one, else its
 * business name, else its row number. Content rather than position, so the
 * same client imported again from a re-sorted or longer sheet keeps its ref
 * (and its import key) and is never added twice.
 */
export function sheetSourceRef(row: { url?: string; name?: string }, sourceRow: number): string {
  const site = row.url ? siteRef(row.url) : null;
  if (site) return site.slice(0, 200);
  if (row.name) return `name:${row.name.toLowerCase().replace(/\s+/g, " ").trim()}`.slice(0, 200);
  return `row:${sourceRow}`;
}

export interface ClientSheetRows {
  /** Rows a preview can check. */
  rows: ClientImportRow[];
  /** Rows the sheet itself makes unusable, already refused with a plain reason. */
  refused: ClientImportPreviewRow[];
  /** The sheet row number of each row, in order, for showing where it came from. */
  rowNumbers: number[];
  /** The sheet row number of each refused row, in order. */
  refusedRowNumbers: number[];
}

const clip = (value: string | undefined, max: number) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
};

/** Turn the sheet into import rows with the chosen columns. */
export function clientRowsFromSheet(sheet: Pick<ParsedClientSheet, "records">, mapping: ClientSheetMapping): ClientSheetRows {
  const rows: ClientImportRow[] = [];
  const refused: ClientImportPreviewRow[] = [];
  const rowNumbers: number[] = [];
  const refusedRowNumbers: number[] = [];
  const cell = (values: string[], field: ClientSheetField) => (mapping[field] === undefined ? undefined : values[mapping[field]!]);
  for (const record of sheet.records) {
    const name = clip(cell(record.values, "name"), 120);
    const url = clip(cell(record.values, "url"), 2048)?.replace(/\s/g, "");
    const rawEmail = clip(cell(record.values, "ownerEmail"), 254);
    const phone = clip(cell(record.values, "phone"), 40);
    const address = clip(cell(record.values, "address"), 300);
    // Two sheet rows that share a ref both stay; the preview marks the later one a duplicate.
    const sourceRef = sheetSourceRef({ url, name }, record.sourceRow);
    const base = { sourceRef, ...(name ? { name } : {}), ...(url && url.length >= 4 ? { url } : {}), ...(phone ? { phone } : {}), ...(address ? { address } : {}) };
    const email = rawEmail ? z.string().trim().toLowerCase().email().max(254).safeParse(rawEmail) : null;
    if (email && !email.success) {
      refused.push({ row: clientImportRowSchema.parse(base), state: "refused", reason: `“${rawEmail}” isn’t an email address. Fix it in the sheet, or clear it to add the client without an owner link.` });
      refusedRowNumbers.push(record.sourceRow);
      continue;
    }
    if (url && url.length < 4) {
      refused.push({ row: clientImportRowSchema.parse({ ...base, url: undefined }), state: "refused", reason: "The website is too short to be an address." });
      refusedRowNumbers.push(record.sourceRow);
      continue;
    }
    rows.push(clientImportRowSchema.parse({ ...base, ...(email?.success ? { ownerEmail: email.data } : {}) }));
    rowNumbers.push(record.sourceRow);
  }
  return { rows, refused, rowNumbers, refusedRowNumbers };
}

const sheetInputSchema = z.object({
  text: z.string().max(CLIENT_SHEET_MAX_BYTES * 2),
  mapping: z.record(z.enum(CLIENT_SHEET_FIELDS), z.number().int().min(0).max(200)).optional(),
}).strict();

/** The sheet as a source adapter. Rows the sheet makes unusable are left out; use clientRowsFromSheet to show them. */
export const sheetClientImportAdapter: ClientImportSourceAdapter = {
  source: "sheet",
  async readRows(input: unknown) {
    const { text, mapping } = sheetInputSchema.parse(input);
    const sheet = parseClientSheet(text);
    return clientRowsFromSheet(sheet, mapping ?? detectClientSheetColumns(sheet)).rows;
  },
};
