import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { env } from '../config/env';
import { loginSchema, refreshSchema, changePasswordSchema } from '../validators/auth.validators';
import * as authController from '../controllers/auth.controller';

const router = Router();

// Strict limiter for credential endpoints (brute-force protection).
const authLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  limit: env.authRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
  },
});

// Dedicated limiter for authenticated password changes:
// Primary key is the authenticated userId so staff sharing a school NAT/IP are not affected.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    return req.user?._id ? `user_${req.user._id}` : (req.ip || 'anonymous');
  },
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many password change attempts. Please try again after 15 minutes.',
    },
  },
});

router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', authLimiter, validate({ body: refreshSchema }), authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.patch('/me/preferences', authenticate, authController.updatePreferences);
router.post(
  '/change-password',
  authenticate,
  changePasswordLimiter,
  validate({ body: changePasswordSchema }),
  authController.changePassword
);

export default router;
