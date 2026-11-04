import { describe, expect, it } from "vitest";

import {
  isReceiptPaper,
  RECEIPT_PAPER_ORDER,
  receiptPageStyle,
  receiptPaperSpec,
  receiptSheetStyle,
} from "@/domain/receiptPaper";

describe("receipt paper", () => {
  it("keeps printed content inside the printable area of each roll", () => {
    expect(receiptPaperSpec("58mm").widthMm).toBeLessThan(58);
    expect(receiptPaperSpec("80mm").widthMm).toBeLessThan(80);
    expect(receiptPaperSpec("58mm").widthMm).toBeGreaterThan(40);
    expect(receiptPaperSpec("80mm").widthMm).toBeGreaterThan(60);
  });

  it("prints more characters per line as the paper gets wider", () => {
    const small = receiptPaperSpec("58mm").charsPerLine;
    const medium = receiptPaperSpec("80mm").charsPerLine;
    const large = receiptPaperSpec("a4").charsPerLine;
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });

  it("tells the browser the page size instead of leaving it to the driver", () => {
    expect(receiptPageStyle("58mm")).toContain("size: 58mm auto");
    expect(receiptPageStyle("80mm")).toContain("size: 80mm auto");
    expect(receiptPageStyle("a4")).toContain("size: A4 portrait");
    expect(receiptPageStyle("80mm")).toMatch(/margin: \d/);
  });

  it("sizes the sheet in millimetres with a monospace face", () => {
    const sheet = receiptSheetStyle("58mm");
    expect(sheet.width).toBe("52mm");
    expect(sheet.fontSize).toBe("10px");
    expect(sheet.fontFamily).toContain("monospace");
  });

  it("rejects values that are not a known paper", () => {
    expect(isReceiptPaper("80mm")).toBe(true);
    expect(isReceiptPaper("100mm")).toBe(false);
    expect(isReceiptPaper(undefined)).toBe(false);
  });
});
