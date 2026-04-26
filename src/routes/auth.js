import express from 'express';
import authController, { registerSchema, loginSchema } from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.me);

export default router;
