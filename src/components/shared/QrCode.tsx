import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * QR code drawn as one SVG path from the encoder's module grid, so it prints as
 * crisp black squares at any size and no HTML is injected. Pass ASCII only: the
 * default encoder mode is byte mode.
 *
 * Used by printed receipts and by employee ID cards, so it lives in shared.
 */
export function QrCode({
  value,
  size,
  className,
}: {
  value: string;
  size: number;
  className?: string;
}) {
  const modules = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(value);
    code.make();
    const count = code.getModuleCount();
    const dark: string[] = [];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (code.isDark(row, col)) dark.push(`M${col} ${row}h1v1h-1z`);
      }
    }
    return { count, path: dark.join("") };
  }, [value]);

  // A two-module quiet zone around the code is required for scanners to find it.
  const quiet = 2;
  const total = modules.count + quiet * 2;

  return (
    <svg
      role="img"
      aria-label={`QR code ${value}`}
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      className={className ?? "block shrink-0"}
    >
      <rect width={total} height={total} fill="#fff" />
      <path d={modules.path} transform={`translate(${quiet} ${quiet})`} fill="#000" />
    </svg>
  );
}
