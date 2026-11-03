import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLES, can } from "@/domain/roles";

describe("reference data permissions", () => {
  it("keeps mobile money networks to the owner, general manager and super admin", () => {
    const managers = ROLES.filter((role) => can([role], "reference.manage"));

    expect(managers).toEqual(["super_admin", "company_owner", "general_manager"]);
  });

  it("lets any staff member except an auditor keep currencies and rates correct", () => {
    const editors = ROLES.filter((role) => can([role], "currencies.manage"));

    expect(editors).toEqual(ROLES.filter((role) => role !== "auditor"));
    expect(editors).toContain("mobile_money_teller");
    expect(editors).not.toContain("auditor");
  });

  it("no longer offers a rate-only permission that gates nothing", () => {
    expect(PERMISSIONS).toContain("currencies.manage");
    expect(PERMISSIONS).not.toContain("forex.rates.manage");
  });
});
