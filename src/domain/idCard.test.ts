import { describe, expect, it } from "vitest";

import {
  cardNameFontSize,
  ID_CARD_GREEN,
  idCardLink,
  idCardPath,
  normalizeStaffCode,
  primaryRoleLabel,
  STAFF_CODE_PATTERN,
  staffCardSchema,
  staffPhotoError,
  staffInitials,
  MAX_STAFF_PHOTO_BYTES,
} from "./idCard";

describe("staff card numbers", () => {
  it("normalises typing into the printed form", () => {
    expect(normalizeStaffCode(" fd 0012 ")).toBe("FD-0012");
    expect(normalizeStaffCode("fd/00/12")).toBe("FD0012");
    expect(normalizeStaffCode("A".repeat(30))).toHaveLength(20);
  });

  it("rejects a number that would fail the database check", () => {
    expect(STAFF_CODE_PATTERN.test("")).toBe(false);
    expect(STAFF_CODE_PATTERN.test("A")).toBe(false);
    expect(STAFF_CODE_PATTERN.test("-FD01")).toBe(false);
    expect(STAFF_CODE_PATTERN.test("FD-0001")).toBe(true);

    const short = staffCardSchema.safeParse({
      userId: "3f0a2c4e-1b2d-4c3e-8f4a-5b6c7d8e9f01",
      staffCode: " ",
    });
    expect(short.success).toBe(false);
  });

  it("accepts a UUID and normalises the number in one step", () => {
    const parsed = staffCardSchema.safeParse({
      userId: "3f0a2c4e-1b2d-4c3e-8f4a-5b6c7d8e9f01",
      staffCode: " fd 0042 ",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.staffCode : "").toBe("FD-0042");
  });
});

describe("staff photo limits", () => {
  it("only accepts raster images within the size limit", () => {
    expect(staffPhotoError({ type: "image/jpeg", size: 2048 })).toBeNull();
    expect(staffPhotoError({ type: "image/svg+xml", size: 2048 })).toMatch(/JPG, PNG or WebP/);
    expect(staffPhotoError({ type: "image/png", size: MAX_STAFF_PHOTO_BYTES + 1 })).toMatch(
      /under 5 MB/,
    );
    expect(staffPhotoError({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
});

describe("verification link", () => {
  it("is the path the app serves, on whatever origin printed the card", () => {
    const token = "3f0a2c4e-1b2d-4c3e-8f4a-5b6c7d8e9f01";
    expect(idCardPath(token)).toBe(`/id/${token}`);
    expect(idCardLink(token, "https://findeskk.vercel.app")).toBe(
      `https://findeskk.vercel.app/id/${token}`,
    );
  });

  it("escapes a token so the link cannot smuggle another path", () => {
    expect(idCardLink("a/b?c", "https://example.com")).toBe("https://example.com/id/a%2Fb%3Fc");
  });
});

describe("card text", () => {
  it("uses initials instead of an empty face", () => {
    expect(staffInitials("Adaline Nakato")).toBe("AN");
    expect(staffInitials("Grace")).toBe("G");
    expect(staffInitials("   ")).toBe("?");
  });

  it("names the most senior role", () => {
    expect(primaryRoleLabel(["forex_teller", "super_admin"])).toBe("Super Admin");
    expect(primaryRoleLabel([])).toBe("Staff");
  });
});

describe("card name sizing", () => {
  it("keeps the reference name at full size", () => {
    expect(cardNameFontSize("Kasongo Kelly David")).toBe(25);
  });

  it("shrinks a long name instead of cutting it off", () => {
    const size = cardNameFontSize("Bartholomew Nsubuga-Kirunda Wasswa");
    expect(size).toBeLessThan(25);
    expect(size).toBeGreaterThanOrEqual(13);
  });

  it("stops at the smallest readable size for an absurdly long name", () => {
    expect(cardNameFontSize("A".repeat(80))).toBe(13);
  });

  it("falls back to the reference size for an empty name", () => {
    expect(cardNameFontSize("   ")).toBe(25);
  });
});

describe("card palette", () => {
  it("is the printed artwork colour, not the screen theme", () => {
    expect(ID_CARD_GREEN).toBe("#0f7a3d");
  });
});
