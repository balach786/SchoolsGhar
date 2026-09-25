 
/**
 * Express request augmentation for the authenticated user.
 * (Imported globally via tsconfig typeRoots.)
 */
import type { AuthUser } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
