import { z } from "zod";

export const assignCasesSchema = z.object({
  cases: z.array(
    z.object({
      caseId: z.uuid(),
      isPrimary: z.boolean().optional(),
    }),
  ),
});


export const reassignCasesSchema = z.object({
  fromAdvocateId: z.uuid(),
  toAdvocateId: z.uuid(),
  caseIds: z.array(z.uuid()).min(1),
});