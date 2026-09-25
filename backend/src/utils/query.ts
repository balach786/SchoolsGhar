import { Model } from 'mongoose';
import { ApiError } from './ApiError';

/** Standard pagination params with a hard maximum limit. */
export const MAX_PAGE_LIMIT = 100;
export const DEFAULT_PAGE_LIMIT = 20;

export function parsePagination(query: { page?: unknown; limit?: unknown }) {
  const page = Math.max(1, Number(query.page) || 1);
  const rawLimit = Number(query.limit) || DEFAULT_PAGE_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_PAGE_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
}

export async function paginateQuery<T>(
  model: Model<T>,
  filter: object,
  page: number,
  limit: number,
  sort: Record<string, 1 | -1> = { createdAt: -1 }
): Promise<{ data: T[]; total: number; totalPages: number }> {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);
  return { data: data as T[], total, totalPages: Math.ceil(total / limit) || 0 };
}

/** Turn a possibly-invalid ObjectId-ish string into a query filter safely. */
export function idOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value;
}

/** Small helper to require a document exists, else 404. */
export function ensureFound<T>(doc: T | null | undefined, message = 'Resource not found'): T {
  if (!doc) throw ApiError.notFound(message);
  return doc;
}
