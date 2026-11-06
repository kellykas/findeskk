import { describe, expect, it } from "vitest";

import {
  BRAND_COLORS,
  DEFAULT_BRAND_COLOR,
  DEFAULT_FAVICON,
  brandInitials,
  brandTheme,
  faviconType,
  isHexColor,
  isLogoUrl,
  normalizeHex,
  readableInk,
  relativeLuminance,
} from "./branding";

describe("branding", () => {
  it("normalises the hex forms a colour input or a human may produce", () => {
    expect(normalizeHex("#7C3AED")).toBe("#7c3aed");
    expect(normalizeHex("7c3aed")).toBe("#7c3aed");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("purple")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(isHexColor("#7c3aed")).toBe(true);
  });

  it("keeps button ink readable on light and dark brand colours", () => {
    expect(readableInk("#7c3aed")).toBe("#ffffff");
    expect(readableInk("#facc15")).toBe("#1a1023");
    expect(relativeLuminance("#ffffff")).toBeGreaterThan(0.9);
    expect(relativeLuminance("#000000")).toBeLessThan(0.01);
  });

  it("falls back to the FinDesk violet for junk input", () => {
    expect(brandTheme("not-a-colour")["--primary"]).toBe(DEFAULT_BRAND_COLOR);
    expect(brandTheme("#2563eb")["--primary"]).toBe("#2563eb");
  });

  it("themes every token that carries the brand colour", () => {
    const vars = brandTheme("#16a34a");
    for (const name of ["--primary", "--ring", "--sidebar-primary", "--chart-1"]) {
      expect(vars[name]).toBe("#16a34a");
    }
    expect(vars["--primary-foreground"]).toBe("#ffffff");
    expect(vars["--accent"]).toContain("#16a34a");
  });

  it("derives a monogram from the website name", () => {
    expect(brandInitials("FinDesk")).toBe("FD");
    expect(brandInitials("Kampala Forex Bureau")).toBe("KB");
    expect(brandInitials("  ")).toBe("FD");
    expect(brandInitials("Z")).toBe("Z");
  });

  it("only accepts https logo links", () => {
    expect(isLogoUrl("")).toBe(true);
    expect(isLogoUrl("https://cdn.example.com/logo.png")).toBe(true);
    expect(isLogoUrl("http://cdn.example.com/logo.png")).toBe(false);
    expect(isLogoUrl("javascript:alert(1)")).toBe(false);
  });

  it("offers only real hex presets", () => {
    for (const colour of BRAND_COLORS) expect(isHexColor(colour.hex)).toBe(true);
  });

  it("describes an uploaded logo with its real image type", () => {
    expect(faviconType("https://cdn.example.com/logo-17.png")).toBe("image/png");
    expect(faviconType("https://cdn.example.com/logo-17.png?download=1")).toBe("image/png");
    expect(faviconType("https://cdn.example.com/logo.webp")).toBe("image/webp");
    expect(faviconType("https://cdn.example.com/logo.JPG")).toBe("image/jpeg");
    expect(faviconType("https://cdn.example.com/logo.jpeg")).toBe("image/jpeg");
    expect(faviconType(DEFAULT_FAVICON)).toBe("image/x-icon");
    expect(faviconType("https://cdn.example.com/logo-without-extension")).toBe("image/png");
  });
});
