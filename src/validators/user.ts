import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),

  email: z.string().email("Invalid email address").max(255),

  phoneNo: z.string().min(8, "Invalid phone number").max(20),

  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(255, "Password is too long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
      "Password must contain uppercase, lowercase, number, and special character",
    ),
});

export const updateUserSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(255)
    .optional(),
  phoneNo: z.string().min(8, "Invalid phone number").max(20).optional(),
  avatar: z.string().url("Invalid avatar url").optional(), //avtar
});
