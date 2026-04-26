import { generatePlatformContent } from '../services/content.js';

/**
 * AI Content Controller
 */
class ContentController {
  async generate(req, res, next) {
    try {
      const result = await generatePlatformContent(req.user.userId, req.body);
      res.status(200).json({ 
        data: result, 
        error: null 
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ContentController();
