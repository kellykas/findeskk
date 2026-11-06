import { useCallback, useEffect, useState } from "react";

import { DEFAULT_RECEIPT_PAPER, isReceiptPaper, type ReceiptPaper } from "@/domain/receiptPaper";
import type { ReceiptFormat } from "@/domain/settings";

// v2: the first key remembered whatever paper a till had touched, so browsers
// that once picked 58 mm kept opening on it. Receipts start on 80 mm now; picks
// made from here on are still remembered.
const STORAGE_KEY = "findesk-receipt-paper-v2";

/**
 * The paper loaded in the printer at this till. It starts on 80 mm, or on the
 * fallback passed in, and remembers a teller's pick per browser: one shop can
 * have a 58 mm printer at the counter and an 80 mm one in the back office.
 */
export function useReceiptPaper(fallback: ReceiptFormat = DEFAULT_RECEIPT_PAPER) {
  const [paper, setPaper] = useState<ReceiptPaper>(fallback);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isReceiptPaper(stored)) setPaper(stored);
    } catch {
      // Storage blocked: the default paper still applies.
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
