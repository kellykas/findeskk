import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, can, isStaffAdmin } from "./access";
import { ROLES, ROLE_LABELS } from "./roles";

describe("access matrix", () => {
  it("defines permissions for every role without duplicates", () => {
    for (const role of ROLES) {
      const granted = ROLE_PERMISSIONS[role];
      expect(granted.length).toBeGreaterThan(0);
      expect(new Set(granted).size).toBe(granted.length);
      for (const permission of granted) expect(PERMISSIONS).toContain(permission);
    }
  });

  it("labels every role", () => {
    for (const role of ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });

  it("gives every role access to the dashboard", () => {
    for (const role of ROLES) expect(can([role], "dashboard.view")).toBe(true);
  });

  it("gives super admins every permission", () => {
    for (const permission of PERMISSIONS) expect(can(["super_admin"], permission)).toBe(true);
  });

  it("keeps auditors read-only", () => {
    expect(can(["auditor"], "reports.view")).toBe(true);
    expect(can(["auditor"], "audit.view")).toBe(true);
    expect(can(["auditor"], "cash.manage")).toBe(false);
    expect(can(["auditor"], "transactions.approve")).toBe(false);
    expect(can(["auditor"], "employees.manage")).toBe(false);
    expect(can(["auditor"], "settings.manage")).toBe(false);
  });

  it("limits staff and branch administration to database staff admins", () => {
    for (const role of ROLES) {
      const managesStaff = can([role], "employees.manage") || can([role], "branches.manage");
      expect(managesStaff).toBe(isStaffAdmin([role]));
    }
  });

  it("denies unknown roles and unassigned staff", () => {
    expect(can([], "dashboard.view")).toBe(false);
    expect(isStaffAdmin([])).toBe(false);
  });
});
