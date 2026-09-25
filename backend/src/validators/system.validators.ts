import { z } from 'zod';

/** POST /api/system/cleanup — explicit retention cleanup windows (days). */
export const cleanupSystemSchema = z
  .object({
    notificationsDays: z.number().int().min(0).max(3650).optional(),
    auditDays: z.number().int().min(0).max(3650).optional(),
  })
  .strict();
