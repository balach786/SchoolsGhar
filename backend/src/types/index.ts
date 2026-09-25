import { Request } from 'express';
import mongoose from 'mongoose';

/** Authenticated user payload attached to the request by auth middleware. */
export interface AuthUser {
  _id: string;
  role: string; // role slug
  roleId: string; // role ObjectId
  email: string;
  name: string;
  tenantId?: string;
  isPlatformAdmin?: boolean;
  permissions?: Record<string, string[]>;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  tenant?: any;
  tenantDb?: mongoose.Connection;
}

export type PageQuery = {
  page?: number;
  limit?: number;
};

export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary?: any;
}
