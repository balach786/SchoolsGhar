import { z } from 'zod';
import { objectIdString } from './attendance.validators';

export const updateSettingsSchema = z
  .object({
    schoolName: z.string().trim().min(2).max(120).optional(),
    schoolLogoUrl: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          return /^https?:\/\//i.test(val);
        },
        'Logo URL must start with http:// or https://'
      ),
    address: z.string().trim().max(300).nullable().optional(),
    phone: z
      .string()
      .trim()
      .nullable()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          return /^((\+92)|(0092)|92|0)?(3[0-9]{2}[\s\-]?\d{7}|[2456789][0-9]{1,2}[\s\-]?\d{7,8})$/.test(val);
        },
        'Invalid Pakistani phone number'
      ),
    email: z.string().trim().email().max(120).nullable().optional(),
    website: z
      .string()
      .trim()
      .nullable()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          return /^https?:\/\//i.test(val);
        },
        'Website URL must start with http:// or https://'
      ),
    principalName: z.string().trim().max(120).nullable().optional(),
    activeSessionId: objectIdString.nullable().optional(),
    currency: z.string().trim().min(2).max(8).optional(),
    receiptPrefix: z.string().trim().min(1).max(12).optional(),
    receiptSettings: z
      .object({
        showLogo: z.boolean().optional(),
        showAddress: z.boolean().optional(),
        showPhone: z.boolean().optional(),
        signatureLabel: z.string().trim().max(60).optional(),
        footerText: z.string().trim().max(200).nullable().optional(),
      })
      .strict()
      .optional(),
    resultCardSettings: z
      .object({
        showLogo: z.boolean().optional(),
        showPosition: z.boolean().optional(),
        showGrade: z.boolean().optional(),
        signatureLabel: z.string().trim().max(60).optional(),
        footerText: z.string().trim().max(200).nullable().optional(),
      })
      .strict()
      .optional(),
    themeSettings: z
      .object({
        accentColor: z.string().trim().max(20).nullable().optional(),
        compactSidebar: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
