/**
 * Branding vocabulary: the name, logo and theme colour a super admin chooses.
 *
 * Pure logic only — no React and no I/O — so the contrast maths and the CSS
 * tokens can be tested without a database or a browser.
 */

export const DEFAULT_APP_NAME = "FinDesk";

/** The violet FinDesk has always used, so an unconfigured install looks right. */
export const DEFAULT_BRAND_COLOR = "#7c3aed";

/** Curated palettes. Any hex works, these are just the quick picks. */
export const BRAND_COLORS = [
  { hex: "#7c3aed", label: "Violet" },
  { hex: "#2563eb", label: "Blue" },
  { hex: "#0d9488", label: "Teal" },
  { hex: "#16a34a", label: "Green" },
  { hex: "#d97706", label: "Amber" },
  { hex: "#dc2626", label: "Red" },
  { hex: "#db2777", label: "Pink" },
  { hex: "#475569", label: "Slate" },
] as const;

export interface Branding {
  appName: string;
  logoUrl: string;
  primary: string;
}

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Expands `#abc` to `#aabbcc`. Returns null for anything that is not a hex colour. */
export function normalizeHex(input: string): string | null {
  const value = input.trim().toLowerCase();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const full = /^#?([0-9a-f]{6})$/.exec(value);
  return full ? `#${full[1]}` : null;
}

export function isHexColor(value: string): boolean {
  return normalizeHex(value) !== null;
}

export function isLogoUrl(value: string): boolean {
  return value === "" || /^https:\/\/\S+$/i.test(value);
}

/** WCAG relative luminance, used to pick ink that stays readable on the brand colour. */
export function relativeLuminance(hex: string): number {
  const value = normalizeHex(hex) ?? DEFAULT_BRAND_COLOR;
  const channels = [1, 3, 5]
    .map((index) => parseInt(value.slice(index, index + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  const r = channels[0] ?? 0;
  const g = channels[1] ?? 0;
  const b = channels[2] ?? 0;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White or near-black, whichever reads on the chosen colour. */
export function readableInk(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? "#1a1023" : "#ffffff";
}

/** The monogram shown when no logo is uploaded. `FinDesk` -> `FD`. */
export function brandInitials(appName: string): string {
  const words = appName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "FD";
  if (words.length > 1) {
    const first = words[0]?.[0] ?? "";
    const last = words[words.length - 1]?.[0] ?? "";
    return (first + last).toUpperCase();
  }
  const word = words[0] ?? "";
  const camel = /[A-Z]/.exec(word.slice(1))?.[0] ?? word[1] ?? "";
  return ((word[0] ?? "") + camel).toUpperCase();
}

/**
 * The CSS custom properties the theme overrides. Everything else in the palette
 * is derived from the one colour, so a single choice repaints the whole app
 * without a designer in the loop.
 */
export function brandTheme(primary: string): Record<string, string> {
  const hex = normalizeHex(primary) ?? DEFAULT_BRAND_COLOR;
  const ink = readableInk(hex);
  return {
    "--primary": hex,
    "--primary-foreground": ink,
    "--ring": hex,
    "--sidebar-primary": hex,
    "--sidebar-primary-foreground": ink,
    "--chart-1": hex,
    "--accent": `color-mix(in oklab, ${hex} 14%, white)`,
    "--accent-foreground": `color-mix(in oklab, ${hex} 78%, black)`,
    "--sidebar-accent": `color-mix(in oklab, ${hex} 10%, white)`,
    "--sidebar-accent-foreground": `color-mix(in oklab, ${hex} 78%, black)`,
  };
}
