import { z } from "zod";

export function parseWithLogging<T>(schema: z.ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod Validation Failed] ${label}:`, result.error.format());
    console.error(`[Zod Raw Data] ${label}:`, data);
    throw new Error(`Data validation failed for ${label}. See console for details.`);
  }
  return result.data;
}
