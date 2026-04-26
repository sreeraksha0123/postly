import express from 'express';
import postsController from '../controllers/postsController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/publish', postsController.publish);
router.post('/schedule', postsController.schedule);
router.get('/', postsController.list);
router.get('/:id', postsController.getById);
router.post('/:id/retry', postsController.retry);
router.delete('/:id', postsController.cancel);

export default router;
