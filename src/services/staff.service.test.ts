import { describe, expect, it } from "vitest";
import { buildStaffMembers, staffErrorMessage } from "./staff.service";

const profile = (id: string, display_name: string, email: string | null = null) => ({
  id,
  display_name,
  active: true,
  created_at: "2026-11-01T00:00:00Z",
  email,
});

describe("buildStaffMembers", () => {
  const managerId = "11111111-1111-4111-8111-111111111111";
  const tellerId = "22222222-2222-4222-8222-222222222222";

  it("groups roles and branch assignments per staff member", () => {
    const members = buildStaffMembers(
      [profile(managerId, "Branch Manager"), profile(tellerId, "Teller", "teller@example.com")],
      [
        { user_id: managerId, role: "branch_manager" },
        { user_id: tellerId, role: "forex_teller" },
        { user_id: tellerId, role: "forex_teller" },
      ],
      [
        { user_id: tellerId, branch_id: "b1" },
        { user_id: tellerId, branch_id: "b1" },
      ],
    );

    const teller = members.find((member) => member.id === tellerId);
    expect(teller?.roles).toEqual(["forex_teller"]);
    expect(teller?.branchIds).toEqual(["b1"]);
    expect(teller?.email).toBe("teller@example.com");
    expect(members.map((member) => member.displayName)).toEqual(["Branch Manager", "Teller"]);
  });

  it("drops unknown roles and falls back to the email for names", () => {
    const members = buildStaffMembers(
      [profile(managerId, "  ", "owner@example.com")],
      [{ user_id: managerId, role: "owner" }],
      [],
    );

    expect(members[0]?.displayName).toBe("owner@example.com");
    expect(members[0]?.roles).toEqual([]);
    expect(members[0]?.branchIds).toEqual([]);
  });

  it("orders roles the way the role list is declared", () => {
    const members = buildStaffMembers(
      [profile(tellerId, "Teller")],
      [
        { user_id: tellerId, role: "auditor" },
        { user_id: tellerId, role: "branch_manager" },
      ],
      [],
    );

    expect(members[0]?.roles).toEqual(["branch_manager", "auditor"]);
  });
});

describe("staffErrorMessage", () => {
  it("turns database constraints into readable guidance", () => {
    expect(staffErrorMessage("Forbidden")).toContain("super admin or company owner");
    expect(staffErrorMessage("Only a super admin or the company owner can manage")).toContain(
      "super admin or company owner",
    );
    expect(staffErrorMessage("You cannot delete your own account.")).toContain("your own");
    expect(staffErrorMessage("The company needs at least one administrator.")).toContain(
      "at least one administrator",
    );
    expect(staffErrorMessage("An employee with that email already exists.")).toContain(
      "already exists",
    );
  });

  it("passes unknown messages through", () => {
    expect(staffErrorMessage("connection reset")).toBe("connection reset");
  });
});
