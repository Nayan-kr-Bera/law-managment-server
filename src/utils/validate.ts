import { ZodSchema } from "zod";

export const validate = <T>(
  schema: ZodSchema<T>,
  data: unknown
):
  | { success: true; data: T }
  | { success: false; message: string } => {
  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      message: result.error.issues[0].message,
    };
  }

  return {
    success: true,
    data: result.data,
  };
};