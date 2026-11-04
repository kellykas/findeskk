import { describe, expect, it } from "vitest";
import { resetEmailSchema, resetPasswordSchema, signInSchema } from "./auth";

describe("auth schemas", () => {
  it("trims the email before it reaches the auth server", () => {
    const parsed = signInSchema.parse({ email: "  admin@findesk.co.ug  ", password: "secret123" });
    expect(parsed.email).toBe("admin@findesk.co.ug");
  });

  it("asks for a usable address before sending a reset link", () => {
    expect(resetEmailSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(resetEmailSchema.parse({ email: " admin@findesk.co.ug " }).email).toBe(
      "admin@findesk.co.ug",
    );
  });

  it("rejects a short new password", () => {
    const result = resetPasswordSchema.safeParse({ password: "short", confirm: "short" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("at least 8");
  });

  it("rejects a confirmation that does not match", () => {
    const result = resetPasswordSchema.safeParse({
      password: "maserekanoe12345",
      confirm: "maserekanoe1234",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Passwords do not match.");
  });

  it("accepts a matching pair", () => {
    expect(
      resetPasswordSchema.safeParse({ password: "maserekanoe12345", confirm: "maserekanoe12345" })
        .success,
    ).toBe(true);
  });
});
