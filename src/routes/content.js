import express from 'express';
import contentController from '../controllers/contentController.js';
import { generateSchema } from '../services/content.js';
import { validate } from '../middleware/validate.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

router.post('/generate', authMiddleware, validate(generateSchema), contentController.generate);

export default router;
