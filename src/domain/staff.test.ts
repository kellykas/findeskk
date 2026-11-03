import { describe, expect, it } from "vitest";
import { normalizeEmail, staffAccountSchema, staffUpdateSchema } from "./staff";

const accountId = "8f1c3a8e-6a1d-4a4f-9a3e-4b6a1f2c3d4e";

describe("staff account input", () => {
  it("trims the name and email of a new sign-in", () => {
    const parsed = staffAccountSchema.parse({
      displayName: " A. Namutebi ",
      email: " teller@example.com ",
      password: "secret123",
      roles: ["forex_teller"],
    });
    expect(parsed.displayName).toBe("A. Namutebi");
    expect(parsed.email).toBe("teller@example.com");
  });

  it("requires a valid email, a long enough password and a known role", () => {
    const base = {
      displayName: "A. Namutebi",
      email: "teller@example.com",
      password: "secret123",
      roles: ["forex_teller"],
    };
    expect(staffAccountSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
    expect(staffAccountSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(staffAccountSchema.safeParse({ ...base, roles: [] }).success).toBe(false);
    expect(staffAccountSchema.safeParse({ ...base, roles: ["owner"] }).success).toBe(false);
  });
});

describe("staff update input", () => {
  const base = {
    userId: accountId,
    displayName: "Teller",
    active: true,
    roles: ["auditor"],
    password: "",
  };

  it("keeps the existing password when the field is left blank", () => {
    const parsed = staffUpdateSchema.parse({ ...base, active: false });
    expect(parsed.password).toBe("");
    expect(parsed.active).toBe(false);
  });

  it("validates a replacement password and the account id", () => {
    expect(staffUpdateSchema.safeParse({ ...base, password: "secret123" }).success).toBe(true);
    expect(staffUpdateSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(staffUpdateSchema.safeParse({ ...base, userId: "not-a-uuid" }).success).toBe(false);
    expect(staffUpdateSchema.safeParse({ ...base, roles: [] }).success).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims values and treats blanks as missing", () => {
    expect(normalizeEmail(" staff@example.com ")).toBe("staff@example.com");
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});
