import { describe, expect, it } from "vitest";

import { buildXlsx, columnName, sheetNames, type XlsxSheet } from "./xlsx";

/** Reads a stored zip back, so the test checks the archive, not just the strings. */
function readStoredZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOfDirectory = -1;
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      endOfDirectory = index;
      break;
    }
  }
  if (endOfDirectory < 0) throw new Error("No central directory found");

  const count = view.getUint16(endOfDirectory + 10, true);
  let offset = view.getUint32(endOfDirectory + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, string>();

  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    expect(method).toBe(0);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + size)));

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const sheets: XlsxSheet[] = [
  {
    name: "Summary",
    columns: [{ width: 30 }, { width: 20 }],
    rows: [
      [{ text: "Summary" }],
      [{ text: "Account" }, { text: "Amount" }],
      [
        { text: "Income", bold: true },
        { text: "1,250", value: 1250, decimals: 0, format: "money" },
      ],
    ],
    headerRow: 1,
  },
  {
    name: "Trial balance",
    columns: [{ width: 12 }],
    rows: [[{ text: "Cash on hand" }], [{ text: "2", value: 2, format: "count" }]],
    headerRow: 0,
  },
];

describe("xlsx writer", () => {
  it("writes a workbook of stored parts that read back intact", () => {
    const entries = readStoredZip(buildXlsx(sheets, new Date("2026-11-30T00:00:00Z")));

    expect([...entries.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    expect(entries.get("xl/workbook.xml")).toContain('name="Summary"');
    expect(entries.get("xl/workbook.xml")).toContain('name="Trial balance"');
    expect(entries.get("[Content_Types].xml")).toContain('PartName="/xl/worksheets/sheet2.xml"');
  });

  it("escapes text and keeps amounts as numbers a spreadsheet can add", () => {
    const entries = readStoredZip(buildXlsx(sheets));
    const summary = entries.get("xl/worksheets/sheet1.xml") ?? "";

    expect(summary).toContain("Summary");
    // Shaded header row, then a grouped amount the spreadsheet can total.
    expect(summary).toContain('<c r="B2" s="6" t="inlineStr">');
    expect(summary).toContain('<c r="B3" s="2"><v>1250</v></c>');
    expect(summary).toContain(
      '<c r="A3" s="1" t="inlineStr"><is><t xml:space="preserve">Income</t></is></c>',
    );
    // Plain grouped number format for a whole-shilling amount.
    expect(entries.get("xl/styles.xml")).toContain('numFmtId="3"');

    const trial = entries.get("xl/worksheets/sheet2.xml") ?? "";
    expect(trial).toContain('<c r="A2" s="7"><v>2</v></c>');
  });

  it("escapes text so a company name cannot break the sheet", () => {
    const entries = readStoredZip(
      buildXlsx([
        {
          name: "Summary",
          columns: [{ width: 20 }],
          rows: [[{ text: "Twinz & Co <Desk>" }], [{ text: "line\u0007break" }]],
        },
      ]),
    );
    const sheet = entries.get("xl/worksheets/sheet1.xml") ?? "";
    expect(sheet).toContain("Twinz &amp; Co &lt;Desk&gt;");
    expect(sheet).not.toContain("\u0007");
  });

  it("freezes the rows above the header so headings stay in view", () => {
    const entries = readStoredZip(buildXlsx(sheets));
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain(
      '<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>',
    );
  });
});

describe("sheet names", () => {
  it("trims Excel's invalid characters and long names", () => {
    expect(sheetNames([{ name: "Cash / bank [1100]", columns: [], rows: [] }])).toEqual([
      "Cash   bank  1100",
    ]);
    expect(sheetNames([{ name: "A".repeat(40), columns: [], rows: [] }])[0]).toHaveLength(31);
  });

  it("keeps duplicate names apart", () => {
    const names = sheetNames([
      { name: "Profit and loss", columns: [], rows: [] },
      { name: "profit and loss", columns: [], rows: [] },
    ]);
    expect(names[0]).toBe("Profit and loss");
    expect(names[1]).not.toBe(names[0]);
  });
});

describe("column names", () => {
  it("counts past Z", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(27)).toBe("AB");
  });
});
