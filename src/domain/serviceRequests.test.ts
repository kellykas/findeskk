import { describe, expect, it } from "vitest";

import {
  MAX_MESSAGE_LENGTH,
  isAwaitingStaff,
  isRequestStatus,
  isServiceKind,
  normalizeNewRequest,
  serviceLabel,
  validateMessage,
  validateNewRequest,
} from "./serviceRequests";

const valid = {
  customerName: "Sarah Nakato",
  phone: "+256 700 123 456",
  email: "Sarah@Example.com",
  service: "forex",
  message: "I need the dollar rate for 500 USD today.",
};

describe("service requests", () => {
  it("accepts a complete request and trims what the customer typed", () => {
    expect(validateNewRequest(valid)).toBeNull();
    expect(
      normalizeNewRequest({ ...valid, customerName: "  Sarah  ", email: " Sarah@Example.com " }),
    ).toMatchObject({ customerName: "Sarah", email: "sarah@example.com" });
  });

  it("names the field that needs fixing", () => {
    expect(validateNewRequest({ ...valid, customerName: " " })).toMatch(/name/i);
    expect(validateNewRequest({ ...valid, phone: "123" })).toMatch(/phone/i);
    expect(validateNewRequest({ ...valid, email: "not-an-email" })).toMatch(/email/i);
    expect(validateNewRequest({ ...valid, service: "loans" })).toMatch(/service/i);
    expect(validateNewRequest({ ...valid, message: "hi" })).toMatch(/need|words/i);
    expect(validateNewRequest({ ...valid, message: "x".repeat(MAX_MESSAGE_LENGTH + 1) })).toMatch(
      /2000/,
    );
  });

  it("treats email as optional", () => {
    expect(validateNewRequest({ ...valid, email: "" })).toBeNull();
    expect(validateNewRequest({ ...valid, email: "   " })).toBeNull();
  });

  it("keeps chat messages non-empty and inside the limit", () => {
    expect(validateMessage("  ")).toMatch(/message/i);
    expect(validateMessage("Thanks, I will come at 2pm.")).toBeNull();
    expect(validateMessage("x".repeat(MAX_MESSAGE_LENGTH + 1))).toMatch(/2000/);
  });

  it("recognises stored codes and never prints a raw unknown one", () => {
    expect(isServiceKind("mobile_money")).toBe(true);
    expect(isServiceKind("loans")).toBe(false);
    expect(serviceLabel("mobile_money")).toBe("Mobile money");
    expect(serviceLabel("loans")).toBe("Something else");
  });

  it("knows which requests still need a member of staff", () => {
    expect(isAwaitingStaff("waiting")).toBe(true);
    expect(isAwaitingStaff("answered")).toBe(false);
    expect(isRequestStatus("closed")).toBe(true);
    expect(isRequestStatus("deleted")).toBe(false);
  });
});
