import { useCallback, useEffect, useState } from "react";

import { isReceiptPaper, type ReceiptPaper } from "@/domain/receiptPaper";
import type { ReceiptFormat } from "@/domain/settings";

const STORAGE_KEY = "findesk-receipt-paper";

/**
 * The paper loaded in the printer at this till, defaulting to the company
 * setting. It is per browser on purpose: one shop can have a 58 mm printer at
 * the counter and an 80 mm one in the back office, both using the same company
 * defaults.
 */
export function useReceiptPaper(companyFormat: ReceiptFormat) {
  const [paper, setPaper] = useState<ReceiptPaper>(companyFormat);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isReceiptPaper(stored)) setPaper(stored);
    } catch {
      // Storage blocked: the company default still applies.
    }
  }, []);

  const choose = useCallback((next: ReceiptPaper) => {
    setPaper(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice lasts for this receipt.
    }
  }, []);

  return { paper, choose };
}
