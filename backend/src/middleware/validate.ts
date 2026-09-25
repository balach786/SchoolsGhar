import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodEffects } from 'zod';

type Source = 'body' | 'query' | 'params';

/**
 * Zod validation middleware.
 * Usage: validate({ body: schema, query: schema, params: schema })
 * Replaces the request value with the parsed (typed) value.
 */
export function validate(schemas: Partial<Record<Source, AnyZodObject | ZodEffects<AnyZodObject>>>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.query) req.query = schemas.query.parse(req.query) as never;
    if (schemas.params) req.params = schemas.params.parse(req.params) as never;
    next();
  };
}
