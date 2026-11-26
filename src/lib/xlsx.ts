/**
 * A minimal .xlsx writer.
 *
 * Reports need a real workbook: figures Excel can add up, not a CSV that a
 * spreadsheet re-parses (and quietly turns long references into dates or drops
 * leading zeroes). A spreadsheet is a zip of XML parts, so a few hundred lines
 * of stores and headers produce one, with no dependency to keep patched.
 *
 * Entries are stored, not deflated: a monthly report is far below the size
 * where compression matters, and a stored archive is far easier to trust.
 */

export interface XlsxCell {
  text: string;
  /** Numeric value in major units; omitted for text. */
  value?: number | undefined;
  /** Decimal places for a money cell. */
  decimals?: number | undefined;
  format?: "money" | "count" | undefined;
  bold?: boolean | undefined;
}

export interface XlsxColumn {
  /** Column width in characters. */
  width: number;
}

export interface XlsxSheet {
  name: string;
  columns: readonly XlsxColumn[];
  rows: readonly (readonly XlsxCell[])[];
  /**
   * Zero-based index of the header row. It is shaded, and every row above it is
   * frozen so the headings stay in view while the figures scroll.
   */
  headerRow?: number | undefined;
}

/* -------------------------------------------------------------------------- */
/* Zip                                                                        */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0;
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function littleEndian(value: number, bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  for (let index = 0; index < bytes; index += 1) {
    out[index] = (value >>> (index * 8)) & 0xff;
  }
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function dosStamp(at: Date): { time: number; date: number } {
  const time =
    ((at.getUTCHours() & 0x1f) << 11) |
    ((at.getUTCMinutes() & 0x3f) << 5) |
    ((at.getUTCSeconds() >> 1) & 0x1f);
  const date =
    (((at.getUTCFullYear() - 1980) & 0x7f) << 9) |
    (((at.getUTCMonth() + 1) & 0x0f) << 5) |
    (at.getUTCDate() & 0x1f);
  return { time, date };
}

/** UTF-8 flag, so a company name with an accent survives. */
const FLAG_UTF8 = 0x0800;

function zip(entries: readonly ZipEntry[], at: Date): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosStamp(at);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = concat([
      littleEndian(0x04034b50, 4),
      littleEndian(20, 2), // version needed
      littleEndian(FLAG_UTF8, 2),
      littleEndian(0, 2), // stored
      littleEndian(time, 2),
      littleEndian(date, 2),
      littleEndian(crc, 4),
      littleEndian(size, 4),
      littleEndian(size, 4),
      littleEndian(name.length, 2),
      littleEndian(0, 2), // extra field length
      name,
      entry.data,
    ]);
    locals.push(local);

    const central = concat([
      littleEndian(0x02014b50, 4),
      littleEndian(20, 2), // version made by
      littleEndian(20, 2), // version needed
      littleEndian(FLAG_UTF8, 2),
      littleEndian(0, 2),
      littleEndian(time, 2),
      littleEndian(date, 2),
      littleEndian(crc, 4),
      littleEndian(size, 4),
      littleEndian(size, 4),
      littleEndian(name.length, 2),
      littleEndian(0, 2), // extra
      littleEndian(0, 2), // comment
      littleEndian(0, 2), // disk
      littleEndian(0, 2), // internal attributes
      littleEndian(0, 4), // external attributes
      littleEndian(offset, 4),
      name,
    ]);
    centrals.push(central);
    offset += local.length;
  }

  const directory = concat(centrals);
  const end = concat([
    littleEndian(0x06054b50, 4),
    littleEndian(0, 2),
    littleEndian(0, 2),
    littleEndian(entries.length, 2),
    littleEndian(entries.length, 2),
    littleEndian(directory.length, 4),
    littleEndian(offset, 4),
    littleEndian(0, 2),
  ]);

  return concat([...locals, directory, end]);
}

/* -------------------------------------------------------------------------- */
/* SpreadsheetML                                                              */
/* -------------------------------------------------------------------------- */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** XML 1.0 forbids most control characters; a note pasted from elsewhere may carry them. */
function escapeXml(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex -- XML 1.0 forbids these characters.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

/** A1, B1 … Z1, AA1. */
export function columnName(index: number): string {
  let remaining = index + 1;
  let name = "";
  while (remaining > 0) {
    const letter = (remaining - 1) % 26;
    name = String.fromCharCode(65 + letter) + name;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return name;
}

/**
 * Style indexes in xl/styles.xml. They are picked per cell: header, bold text,
 * amounts with the currency's decimal places, and plain whole numbers.
 */
const STYLE = {
  text: 0,
  bold: 1,
  money0: 2,
  money2: 3,
  money0Bold: 4,
  money2Bold: 5,
  header: 6,
  count: 7,
  countBold: 8,
} as const;

function styleFor(cell: XlsxCell, header: boolean): number {
  if (header) return STYLE.header;
  if (cell.value === undefined) return cell.bold ? STYLE.bold : STYLE.text;
  if (cell.format === "count") return cell.bold ? STYLE.countBold : STYLE.count;
  const decimals = cell.decimals ?? 0;
  if (decimals > 0) return cell.bold ? STYLE.money2Bold : STYLE.money2;
  return cell.bold ? STYLE.money0Bold : STYLE.money0;
}

const SHEET_NAME_MAX = 31;
const SHEET_NAME_INVALID = /[\\/:*?"<>|[\]]/g;

/** Excel rejects long or punctuated tab names, and duplicate names within a book. */
export function sheetNames(sheets: readonly XlsxSheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, index) => {
    const base = (sheet.name || `Sheet ${index + 1}`).replace(SHEET_NAME_INVALID, " ").trim();
    let name = base.slice(0, SHEET_NAME_MAX) || `Sheet ${index + 1}`;
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      const tail = ` (${suffix})`;
      name = `${base.slice(0, SHEET_NAME_MAX - tail.length)}${tail}`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function stylesXml(): string {
  return `${XML_HEADER}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF9CA3AF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const widths = sheet.columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`,
    )
    .join("");
  const headerRow = sheet.headerRow ?? -1;
  const freeze = headerRow + 1;
  const views =
    freeze > 0
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${
          freeze + 1
        }" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;

  const rows = sheet.rows
    .map((row, rowIndex) => {
      const number = rowIndex + 1;
      const cells = row
        .map((cell, columnIndex) => {
          const ref = `${columnName(columnIndex)}${number}`;
          const style = styleFor(cell, rowIndex === headerRow);
          if (cell.value !== undefined) {
            return `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
          }
          if (cell.text === "") return "";
          return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
            cell.text,
          )}</t></is></c>`;
        })
        .join("");
      return `<row r="${number}">${cells}</row>`;
    })
    .join("");

  return `${XML_HEADER}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}${
    widths ? `<cols>${widths}</cols>` : ""
  }<sheetData>${rows}</sheetData></worksheet>`;
}

function workbookXml(names: readonly string[]): string {
  const sheets = names
    .map(
      (name, index) =>
        `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");
  return `${XML_HEADER}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets}</sheets>
</workbook>`;
}

function workbookRels(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
        index + 1
      }.xml"/>`,
  ).join("");
  return `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${
    count + 1
  }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypes(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${
        index + 1
      }.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `${XML_HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

const PACKAGE_RELS = `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

/** Builds the workbook bytes for the given sheets. */
export function buildXlsx(sheets: readonly XlsxSheet[], at: Date = new Date()): Uint8Array {
  if (sheets.length === 0) throw new Error("A workbook needs at least one sheet");
  const names = sheetNames(sheets);
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes(sheets.length)) },
    { name: "_rels/.rels", data: encoder.encode(PACKAGE_RELS) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml(names)) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels(sheets.length)) },
    { name: "xl/styles.xml", data: encoder.encode(stylesXml()) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encoder.encode(sheetXml(sheet)),
    })),
  ];
  return zip(entries, at);
}
