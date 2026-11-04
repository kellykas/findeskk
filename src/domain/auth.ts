import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** Asking for a reset link needs only an address. */
export const resetEmailSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address").email("Enter a valid email address"),
});
export type ResetEmailInput = z.infer<typeof resetEmailSchema>;

/**
 * Setting the new password. Supabase's own limit is 72 bytes (bcrypt), and the
 * database enforces the same range, so these checks only spare a round trip.
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Password can have at most 72 characters."),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
