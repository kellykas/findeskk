/**
 * Receipt paper.
 *
 * A browser cannot speak ESC/POS to a USB or Bluetooth till printer: it prints
 * through the operating-system driver. What it can do is tell the browser the
 * page size, keep margins inside the printable area, and print in pure black at
 * a size that survives a thermal head. That is what this module describes.
 *
 * The widths are deliberately a little narrower than the roll (52 mm on a 58 mm
 * roll, 72 mm on an 80 mm roll) because thermal printers cannot print edge to
 * edge and clips look like corrupt receipts to a customer.
 */
export type ReceiptPaper = "58mm" | "80mm" | "a4";

export interface ReceiptPaperSpec {
  id: ReceiptPaper;
  /** Shown in the paper picker. */
  label: string;
  /** CSS `@page size` value: thermal rolls are continuous, so height is auto. */
  pageSize: string;
  margin: string;
  /** Printable content width, in millimetres. */
  widthMm: number;
  fontPx: number;
  lineHeight: number;
  /** Roughly how many monospace characters fit on one line. */
  charsPerLine: number;
}

/**
 * Paper receipts use when nothing else says otherwise.
 *
 * 80 mm is the roll nearly every thermal printer in a till holds, so a receipt
 * opens on it instead of asking the teller to fix the paper on every sale.
 */
export const DEFAULT_RECEIPT_PAPER: ReceiptPaper = "80mm";

export const RECEIPT_PAPERS: Record<ReceiptPaper, ReceiptPaperSpec> = {
  "58mm": {
    id: "58mm",
    label: "58 mm thermal roll",
    pageSize: "58mm auto",
    margin: "2mm 3mm",
    widthMm: 52,
    fontPx: 10,
    lineHeight: 1.35,
    charsPerLine: 30,
  },
  "80mm": {
    id: "80mm",
    label: "80 mm thermal roll",
    pageSize: "80mm auto",
    margin: "3mm 4mm",
    widthMm: 72,
    fontPx: 11.5,
    lineHeight: 1.35,
    charsPerLine: 42,
  },
  a4: {
    id: "a4",
    label: "A4 / Letter sheet",
    pageSize: "A4 portrait",
    margin: "12mm",
    widthMm: 120,
    fontPx: 12,
    lineHeight: 1.45,
    charsPerLine: 70,
  },
};

export const RECEIPT_PAPER_ORDER: ReceiptPaper[] = ["58mm", "80mm", "a4"];

export function isReceiptPaper(value: unknown): value is ReceiptPaper {
  return value === "58mm" || value === "80mm" || value === "a4";
}

export function receiptPaperSpec(paper: ReceiptPaper): ReceiptPaperSpec {
  return RECEIPT_PAPERS[paper] ?? RECEIPT_PAPERS[DEFAULT_RECEIPT_PAPER];
}

/**
 * `@page` rule for this paper. Injected while a receipt is open, because
 * `@page` cannot read a CSS variable or a class — it has to be literal.
 */
export function receiptPageStyle(paper: ReceiptPaper): string {
  const spec = receiptPaperSpec(paper);
  return `@page { size: ${spec.pageSize}; margin: ${spec.margin}; }`;
}

/** Inline sizing for the printed sheet, in real millimetres rather than classes. */
export function receiptSheetStyle(paper: ReceiptPaper): {
  width: string;
  fontSize: string;
  lineHeight: number;
  fontFamily: string;
} {
  const spec = receiptPaperSpec(paper);
  return {
    width: `${spec.widthMm}mm`,
    fontSize: `${spec.fontPx}px`,
    lineHeight: spec.lineHeight,
    // Monospace keeps amounts aligned on a thermal print, where proportional
    // digits drift and columns stop lining up.
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
  };
}
