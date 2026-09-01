import { z } from "zod";

export const changePasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address"),

  otp: z
    .string()
    .trim()
    .min(4, "OTP is required")
    .max(8, "Invalid OTP"),

  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password is too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[!@#$%^&*()_\-+=[\]{};':"\\|,.<>/?]/,
      "Password must contain at least one special character"
    ),
});

export const UpdatePasswordSchema = z
  .object({
    current_password: z
      .string()
      .min(1, "Current password is required"),

    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .max(100, "Password is too long")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(
        /[!@#$%^&*()_\-+=[\]{};':"\\|,.<>/?]/,
        "Password must contain at least one special character"
      ),

    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  })
  .refine((data) => data.current_password !== data.password, {
    message: "New password must be different from current password",
    path: ["password"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>;