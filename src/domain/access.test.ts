import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, can, isStaffAdmin } from "./access";
import { ROLES, ROLE_LABELS, type Role } from "./roles";

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

  it("limits customer read and write to customer-facing roles", () => {
    const customerDuties = [
      "super_admin",
      "company_owner",
      "general_manager",
      "branch_manager",
      "supervisor",
      "mobile_money_teller",
    ];
    for (const role of ROLES) {
      const canRead = can([role], "customers.view");
      const canManage = can([role], "customers.manage");
      const expectsManagement = customerDuties.includes(role);
      // Auditors are the only role without customer access (covered below).
      expect(canRead).toBe(role !== "auditor");
      if (expectsManagement) {
        expect(canManage).toBe(true);
      } else {
        expect(canManage).toBe(false);
      }
    }
  });

  it("denies auditors customer access", () => {
    expect(can(["auditor"], "customers.view")).toBe(false);
    expect(can(["auditor"], "customers.manage")).toBe(false);
  });

  it("gives customers to tellers", () => {
    expect(can(["forex_teller"], "customers.view")).toBe(true);
    expect(can(["forex_teller"], "customers.manage")).toBe(false);
    expect(can(["mobile_money_teller"], "customers.view")).toBe(true);
    expect(can(["mobile_money_teller"], "customers.manage")).toBe(true);
  });

  it("keeps accountants customer read-only", () => {
    expect(can(["accountant"], "customers.view")).toBe(true);
    expect(can(["accountant"], "customers.manage")).toBe(false);
  });

  it("denies an unknown role", () => {
    const unknown = ["not_a_role" as Role];
    expect(can(unknown, "customers.view")).toBe(false);
    expect(can(unknown, "customers.manage")).toBe(false);
    expect(can(unknown, "dashboard.view")).toBe(false);
  });

  it("customers view depends on staff profile", () => {
    expect(can(["supervisor"], "customers.view")).toBe(true);
  });

  it("isolates customers from inactive staff", () => {
    expect(can([], "dashboard.view")).toBe(false);
    expect(can([], "customers.view")).toBe(false);
  });

  it("gives super admins every permission", () => {
    for (const permission of PERMISSIONS) expect(can(["super_admin"], permission)).toBe(true);
  });

  it("keeps auditors read-only", () => {
    expect(can(["auditor"], "reports.view")).toBe(true);
    expect(can(["auditor"], "audit.view")).toBe(true);
    expect(can(["auditor"], "cash.manage")).toBe(false);
    expect(can(["auditor"], "customers.view")).toBe(false);
    expect(can(["auditor"], "customers.manage")).toBe(false);
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
