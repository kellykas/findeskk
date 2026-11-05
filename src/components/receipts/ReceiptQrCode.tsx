import { QrCode } from "@/components/shared/QrCode";

/**
 * QR code for a printed receipt. The drawing lives in shared/QrCode because
 * employee ID cards use the same encoder; this name stays so receipt call sites
 * keep reading clearly.
 */
export function ReceiptQrCode({ value, size }: { value: string; size: number }) {
  return <QrCode value={value} size={size} />;
}
