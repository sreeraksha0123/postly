import express from 'express';
import userController, { updateProfileSchema, socialAccountSchema, aiKeysSchema } from '../controllers/userController.js';
import { validate } from '../middleware/validate.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/profile', userController.getProfile);
router.put('/profile', validate(updateProfileSchema), userController.updateProfile);
router.post('/social-accounts', validate(socialAccountSchema), userController.addSocialAccount);
router.get('/social-accounts', userController.getSocialAccounts);
router.delete('/social-accounts/:id', userController.deleteSocialAccount);
router.put('/ai-keys', validate(aiKeysSchema), userController.updateAiKeys);

export default router;
