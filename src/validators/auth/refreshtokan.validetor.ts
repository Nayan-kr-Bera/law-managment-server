import { z } from "zod";

export const refreshSchema = z.object({
  refresh_token: z
    .string()
    .min(1, "Refresh token is required"),
});

export type RefreshSchema = z.infer<typeof refreshSchema>;