import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth.service";

describe("authErrorMessage", () => {
  it("explains rejected credentials without leaking details", () => {
    expect(authErrorMessage("Invalid login credentials")).toBe("Incorrect email or password.");
  });

  it("asks for email confirmation", () => {
    expect(authErrorMessage("Email not confirmed")).toBe(
      "Confirm your email address before signing in.",
    );
  });

  it("explains rate limiting and connection failures", () => {
    expect(authErrorMessage("Request rate limit reached")).toContain("Too many attempts");
    expect(authErrorMessage("Failed to fetch")).toContain("Check your connection");
  });

  it("passes unknown messages through", () => {
    expect(authErrorMessage("Something else")).toBe("Something else");
  });
});
