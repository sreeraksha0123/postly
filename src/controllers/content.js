import { generatePlatformContent } from '../services/content.js';

export const generate = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const params = { ...req.body, userId };
    const result = await generatePlatformContent(params);
    return res.status(200).json({ data: result, error: null });
  } catch (error) {
    next(error);
  }
};
