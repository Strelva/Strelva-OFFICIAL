import { describe, expect, it } from "vitest";
import { parseTrackerCsv } from "@/products/tracker/csv";
import {
  clientRowsFromSheet,
  detectClientSheetColumns,
  parseClientSheet,
  sheetClientImportAdapter,
  sheetSourceRef,
} from "@/products/agency-clients/sheet-source";
import { clientImportRowSchema } from "@/products/agency-clients/import-contract";

describe("tracker CSV parser delimiter (additive)", () => {
  it("keeps commas by default and splits tabs only when asked", () => {
    expect(parseTrackerCsv("a,b\tc\n").records[0]!.values).toEqual(["a", "b\tc"]);
    expect(parseTrackerCsv("a,b\tc\n", { delimiter: "\t" }).records[0]!.values).toEqual(["a,b", "c"]);
    expect(parseTrackerCsv('"x\ty"\tz', { delimiter: "\t" }).records[0]!.values).toEqual(["x\ty", "z"]);
  });
});

describe("parseClientSheet", () => {
  it("reads a CSV with quoted commas and a header", () => {
    const sheet = parseClientSheet('Business Name,Website,Owner Email,Phone,Address\n"Northside Bakery, LLC",northsidebakery.com,Pat@Northside.example,(716) 555-0142,"12 Main St, Buffalo NY"\n\n');
    expect(sheet.delimiter).toBe(",");
    expect(sheet.hasHeader).toBe(true);
    expect(sheet.headers).toEqual(["Business Name", "Website", "Owner Email", "Phone", "Address"]);
    expect(sheet.records).toHaveLength(1);
    expect(sheet.records[0]!.values[0]).toBe("Northside Bakery, LLC");
  });

  it("reads rows pasted from Google Sheets (tabs) and semicolon CSV", () => {
    expect(parseClientSheet("Company\tURL\nAcme Roofing\tacmeroofing.example\n").delimiter).toBe("\t");
    expect(parseClientSheet("Company\tURL\nAcme Roofing\tacmeroofing.example\n").records[0]!.values).toEqual(["Acme Roofing", "acmeroofing.example"]);
    expect(parseClientSheet("Company;Website\nAcme;acme.example\n").delimiter).toBe(";");
  });

  it("treats a plain list of websites as rows, not a header", () => {
    const sheet = parseClientSheet("northsidebakery.com\nhttps://acme-roofing.example/\n");
    expect(sheet.hasHeader).toBe(false);
    expect(sheet.records).toHaveLength(2);
    expect(detectClientSheetColumns(sheet)).toEqual({ url: 0 });
  });

  it("says plainly when there is nothing to import, and caps the rows", () => {
    expect(parseClientSheet(" \n\n").problems).toEqual(["There are no rows to import."]);
    const long = parseClientSheet(`Website\n${Array.from({ length: 502 }, (_, index) => `site${index}.example`).join("\n")}`);
    expect(long.records).toHaveLength(500);
    expect(long.problems[0]).toMatch(/502 rows/);
  });
});

describe("detectClientSheetColumns", () => {
  it("maps common header names", () => {
    const sheet = parseClientSheet("Client Name,Contact Name,Web Site,E-mail,Telephone,Street Address\nA,B,a.example,b@a.example,7165550142,1 Main\n");
    expect(detectClientSheetColumns(sheet)).toEqual({ name: 0, url: 2, ownerEmail: 3, phone: 4, address: 5 });
  });

  it("never uses a person's name column as the business name", () => {
    const sheet = parseClientSheet("Owner Name,Website\nPat Doe,northside.example\n");
    expect(detectClientSheetColumns(sheet)).toEqual({ url: 1 });
  });

  it("falls back to what the cells hold when headers are unfamiliar", () => {
    const sheet = parseClientSheet("Col A,Col B\nnorthside.example,pat@northside.example\nacme.example,sam@acme.example\n");
    expect(detectClientSheetColumns(sheet)).toEqual({ url: 0, ownerEmail: 1 });
  });
});

describe("clientRowsFromSheet", () => {
  const sheet = parseClientSheet([
    "Business,Website,Owner email,Phone,Address",
    "Northside Bakery,https://www.Northside.example/,PAT@northside.example,(716) 555-0142,12 Main St",
    "Corner Plumbing,,,,",
    "Bad Email Co,bad.example,not-an-email,,",
    ",,,,",
    ",,,716,",
  ].join("\n"));
  const read = clientRowsFromSheet(sheet, detectClientSheetColumns(sheet));

  it("builds contract rows with content-based source refs", () => {
    expect(read.rows[0]).toEqual({ sourceRef: "site:northside.example", name: "Northside Bakery", url: "https://www.Northside.example/",
      ownerEmail: "pat@northside.example", phone: "(716) 555-0142", address: "12 Main St" });
    expect(read.rows[1]).toEqual({ sourceRef: "name:corner plumbing", name: "Corner Plumbing" });
    for (const row of read.rows) expect(clientImportRowSchema.safeParse(row).success).toBe(true);
    expect(read.rowNumbers).toEqual([2, 3, 6]);
  });

  it("refuses a row with an invalid owner email instead of dropping the email", () => {
    expect(read.refused).toHaveLength(1);
    expect(read.refused[0]).toMatchObject({ state: "refused", row: { name: "Bad Email Co" } });
    expect(read.refused[0]!.reason).toMatch(/isn’t an email address/);
    expect(read.refusedRowNumbers).toEqual([4]);
  });

  it("keeps a row with neither website nor name for the preview to call incomplete", () => {
    expect(read.rows[2]).toEqual({ sourceRef: "row:6", phone: "716" });
  });

  it("keeps the same ref for the same client when the sheet is re-sorted", () => {
    expect(sheetSourceRef({ url: "northside.example/" }, 9)).toBe(sheetSourceRef({ url: "https://www.northside.example" }, 2));
    expect(sheetSourceRef({ name: "  Corner   Plumbing " }, 3)).toBe("name:corner plumbing");
  });

  it("is a ClientImportSourceAdapter that only reads", async () => {
    expect(sheetClientImportAdapter.source).toBe("sheet");
    const rows = await sheetClientImportAdapter.readRows({ text: "Website\nnorthside.example\n" });
    expect(rows).toEqual([{ sourceRef: "site:northside.example", url: "northside.example" }]);
    await expect(sheetClientImportAdapter.readRows({ text: "x", extra: true })).rejects.toThrow();
  });
});
