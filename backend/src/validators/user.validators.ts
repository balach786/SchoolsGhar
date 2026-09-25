import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  roleId: z.string().min(1, 'Role is required').optional(),
  personType: z.enum(['teacher', 'accountant', 'staff', 'student']),
  personId: z.string().min(1, 'A person must be selected'),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120).optional(),
  roleId: z.string().min(1, 'Role is required').optional(),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  search: z.string().trim().max(80).optional(),
  role: z.string().trim().max(40).optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

export const searchUnlinkedPeopleQuerySchema = z.object({
  type: z.enum(['teacher', 'accountant', 'staff', 'student']),
  search: z.string().trim().max(80).optional(),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/, 'Slug may only contain lowercase letters, numbers and underscores'),
  description: z.string().trim().max(200).optional(),
  permissions: z.record(z.string(), z.array(z.string())).optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(200).optional(),
  isActive: z.boolean().optional(),
});

export const updateRolePermissionsSchema = z.object({
  permissions: z.record(z.string(), z.array(z.string())),
});

export const listAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  search: z.string().trim().max(80).optional(),
  module: z.string().trim().max(40).optional(),
  action: z.string().trim().max(40).optional(),
  userId: z.string().trim().max(40).optional(),
  from: z.string().trim().max(24).optional(), // yyyy-mm-dd
  to: z.string().trim().max(24).optional(),
});
