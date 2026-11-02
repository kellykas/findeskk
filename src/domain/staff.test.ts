import { describe, expect, it } from "vitest";
import { branchFormSchema, branchInputSchema, normalizeEmail, staffAccessSchema } from "./staff";

describe("branch input", () => {
  it("upper-cases and trims codes", () => {
    const parsed = branchInputSchema.parse({
      code: "  kla-01 ",
      name: " Kampala Road ",
      address: "",
    });
    expect(parsed).toEqual({ code: "KLA-01", name: "Kampala Road", address: "" });
  });

  it("rejects symbols and short codes", () => {
    expect(
      branchInputSchema.safeParse({ code: "KLA 01", name: "Kampala", address: "" }).success,
    ).toBe(false);
    expect(branchInputSchema.safeParse({ code: "K", name: "Kampala", address: "" }).success).toBe(
      false,
    );
  });

  it("requires a branch name", () => {
    expect(branchInputSchema.safeParse({ code: "KLA", name: " ", address: "" }).success).toBe(
      false,
    );
  });

  it("defaults the address and carries the active flag in the form schema", () => {
    expect(branchInputSchema.parse({ code: "KLA", name: "Kampala" }).address).toBe("");
    expect(branchFormSchema.parse({ code: "KLA", name: "Kampala", active: false }).active).toBe(
      false,
    );
  });
});

describe("staff access input", () => {
  const accountId = "8f1c3a8e-6a1d-4a4f-9a3e-4b6a1f2c3d4e";
  const branchId = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

  it("accepts roles and branch assignments", () => {
    const parsed = staffAccessSchema.parse({
      userId: accountId,
      displayName: " A. Namutebi ",
      active: true,
      roles: ["forex_teller", "mobile_money_teller"],
      branchIds: [branchId],
    });
    expect(parsed.displayName).toBe("A. Namutebi");
    expect(parsed.branchIds).toEqual([branchId]);
  });

  it("requires at least one role", () => {
    const result = staffAccessSchema.safeParse({
      userId: accountId,
      displayName: "A. Namutebi",
      active: true,
      roles: [],
      branchIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown roles and malformed ids", () => {
    expect(
      staffAccessSchema.safeParse({
        userId: "not-a-uuid",
        displayName: "A. Namutebi",
        active: true,
        roles: ["owner"],
        branchIds: [],
      }).success,
    ).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims values and treats blanks as missing", () => {
    expect(normalizeEmail(" staff@example.com ")).toBe("staff@example.com");
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});
