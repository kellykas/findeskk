/**
 * The Excel rendering of a report document.
 *
 * Mapping the document to sheets here (rather than building a second set of
 * figures) keeps the workbook and the printed page on the same numbers: a
 * sheet is a section, and its cells are the cells the page shows.
 */
import type { XlsxCell, XlsxSheet } from "../lib/xlsx";
import type { DocCell, DocSection, ReportDocument } from "./reportDocument";

function toCell(cell: DocCell, bold = false): XlsxCell {
  return {
    text: cell.text,
    value: cell.value,
    decimals: cell.decimals,
    format: cell.format,
    bold: bold || undefined,
  };
}

function summarySheet(document: ReportDocument): XlsxSheet {
  const rows: XlsxCell[][] = [];
  const line = (...cells: (XlsxCell | string)[]): void => {
    rows.push(cells.map((cell) => (typeof cell === "string" ? { text: cell } : cell)));
  };
  const heading = (text: string): void => {
    rows.push([{ text, bold: true }]);
  };
  const blank = (): void => {
    rows.push([]);
  };

  rows.push([{ text: document.company.name, bold: true }]);
  if (document.company.legalName) line(document.company.legalName);
  if (document.company.address) line(document.company.address);
  const contact = [document.company.phone, document.company.email, document.company.taxNumber]
    .filter(Boolean)
    .join(" · ");
  if (contact) line(contact);
  blank();

  heading(document.title);
  line(document.subtitle);
  blank();

  for (const entry of document.identity) line(entry.label, entry.value);
  blank();

  heading("Key figures");
  for (const figure of document.figures) line(figure.label, figure.value, figure.note ?? "");
  blank();

  heading("Reconciliation checks");
  for (const check of document.checks) {
    line(check.label, check.ok ? "Passed" : "Failed", check.detail);
  }
  blank();

  heading("Basis of preparation");
  document.notes.forEach((note, index) => line(`${index + 1}. ${note}`));

  return {
    name: "Summary",
    columns: [{ width: 34 }, { width: 24 }, { width: 90 }],
    rows,
    headerRow: 0,
  };
}

function sectionSheet(section: DocSection): XlsxSheet {
  const headerRow = 3;
  const rows: XlsxCell[][] = [
    [{ text: section.title, bold: true }],
    [{ text: section.basis }],
    [],
    section.columns.map((column) => ({ text: column.label, bold: true })),
  ];

  if (section.rows.length === 0 && section.emptyText) {
    rows.push([{ text: section.emptyText }]);
  }
  for (const row of section.rows) {
    rows.push(row.cells.map((cell) => toCell(cell, row.strong)));
  }
  if (section.notes && section.notes.length > 0) {
    rows.push([]);
    for (const note of section.notes) rows.push([{ text: note }]);
  }

  return {
    name: section.title,
    columns: section.columns.map((column) => ({ width: column.width })),
    rows,
    headerRow,
  };
}

/** Every sheet of the workbook, in the order the printed report reads. */
export function reportWorkbook(document: ReportDocument): XlsxSheet[] {
  return [summarySheet(document), ...document.sections.map(sectionSheet)];
}

/** A file name that survives every download dialog. */
export function workbookFileName(document: ReportDocument): string {
  return `${document.fileName}.xlsx`;
}
