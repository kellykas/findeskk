import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccessDenied } from "@/components/shared";
import { MODULES } from "@/config/modules";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, can, isStaffAdmin } from "@/domain/roles";

describe("module permissions", () => {
  it("declares a permission for every module that really exists", () => {
    for (const module of MODULES) {
      expect(PERMISSIONS).toContain(module.permission);
    }
  });

  it("never maps a role to a permission that does not exist", () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it("keeps route paths unique", () => {
    const paths = MODULES.map((module) => module.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("signed-in page access by role", () => {
  it("lets the company owner and super admin open every page", () => {
    for (const role of ["company_owner", "super_admin"] as const) {
      for (const module of MODULES) {
        expect(can([role], module.permission)).toBe(true);
      }
    }
  });

  it("keeps a forex teller out of finance, reports and settings", () => {
    expect(can(["forex_teller"], "forex.transact")).toBe(true);
    expect(can(["forex_teller"], "expenses.manage")).toBe(false);
    expect(can(["forex_teller"], "reports.view")).toBe(false);
    expect(can(["forex_teller"], "audit.view")).toBe(false);
    expect(can(["forex_teller"], "settings.manage")).toBe(false);
    expect(can(["forex_teller"], "employees.manage")).toBe(false);
  });

  it("keeps a mobile money teller out of forex", () => {
    expect(can(["mobile_money_teller"], "momo.transact")).toBe(true);
    expect(can(["mobile_money_teller"], "forex.transact")).toBe(false);
    expect(can(["mobile_money_teller"], "expenses.manage")).toBe(false);
  });

  it("gives an accountant finance and reports but not trading", () => {
    expect(can(["accountant"], "expenses.manage")).toBe(true);
    expect(can(["accountant"], "reports.view")).toBe(true);
    expect(can(["accountant"], "audit.view")).toBe(true);
    expect(can(["accountant"], "forex.transact")).toBe(false);
    expect(can(["accountant"], "cash.manage")).toBe(false);
  });

  it("gives an auditor read-only reports and audit, nothing operational", () => {
    expect(can(["auditor"], "reports.view")).toBe(true);
    expect(can(["auditor"], "audit.view")).toBe(true);
    expect(can(["auditor"], "expenses.manage")).toBe(false);
    expect(can(["auditor"], "forex.transact")).toBe(false);
    expect(can(["auditor"], "momo.transact")).toBe(false);
  });

  it("restricts settings to staff admins", () => {
    expect(isStaffAdmin(["super_admin"])).toBe(true);
    expect(isStaffAdmin(["company_owner"])).toBe(true);
    for (const role of ROLES) {
      if (role === "super_admin" || role === "company_owner") continue;
      expect(can([role], "settings.manage")).toBe(false);
    }
  });

  it("grants nothing to a viewer with no roles", () => {
    for (const module of MODULES) {
      expect(can([], module.permission)).toBe(false);
    }
  });
});

describe("AccessDenied", () => {
  it("explains the restriction instead of rendering the page", () => {
    render(<AccessDenied title="Reports are restricted" description="Ask a super admin." />);

    expect(screen.getByRole("heading", { name: "Reports are restricted" })).toBeInTheDocument();
    expect(screen.getByText("Ask a super admin.")).toBeInTheDocument();
  });
});
