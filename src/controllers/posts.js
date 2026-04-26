const prisma = require('../config/db');
const publishingService = require('../services/publishing');
const { addPublishJobs } = require('../queue/publisher');

exports.publish = async (req, res, next) => {
  try {
    const result = await publishingService.publishPost(req.user.userId, req.body);
    return res.status(202).json({ data: result, error: null });
  } catch (error) { next(error); }
};

exports.schedule = async (req, res, next) => {
  try {
    const publishDate = new Date(req.body.publishAt);
    if (publishDate <= new Date()) {
      return res.status(400).json({ data: null, error: { message: 'Schedule time must be in the future', code: 'INVALID_SCHEDULE_TIME' } });
    }
    const result = await publishingService.schedulePost(req.user.userId, req.body);
    return res.status(202).json({ data: result, error: null });
  } catch (error) { next(error); }
};

/**
 * List posts with pagination and filtering
 */
exports.list = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const { status, platform, date_from, date_to } = req.query;

    const skip = (page - 1) * limit;

    // Build dynamic where clause
    const where = { userId };
    if (status) where.status = status;
    if (platform) {
      where.platformPosts = {
        some: { platform: platform.toUpperCase() }
      };
    }
    if (date_from || date_to) {
      where.createdAt = {};
      if (date_from) where.createdAt.gte = new Date(date_from);
      if (date_to) where.createdAt.lte = new Date(date_to);
    }

    // Execute queries
    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { platformPosts: true }
      })
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      data: posts,
      meta: { total, page, limit, totalPages },
      error: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single post details
 */
exports.getById = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: { platformPosts: true }
    });

    if (!post || post.userId !== userId) {
      return res.status(404).json({
        data: null,
        error: { message: 'Post not found', code: 'NOT_FOUND' }
      });
    }

    return res.status(200).json({
      data: post,
      error: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retry failed platform posts
 */
exports.retry = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const postId = req.params.id;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        platformPosts: { where: { status: 'FAILED' } }
      }
    });

    if (!post || post.userId !== userId) {
      return res.status(404).json({
        data: null,
        error: { message: 'Post not found', code: 'NOT_FOUND' }
      });
    }

    if (post.platformPosts.length === 0) {
      return res.status(400).json({
        data: null,
        error: { message: 'No failed platform posts to retry', code: 'NO_FAILED_POSTS' }
      });
    }

    // Update status to QUEUED before re-queueing
    await prisma.platformPost.updateMany({
      where: {
        id: { in: post.platformPosts.map(pp => pp.id) }
      },
      data: { status: 'QUEUED', errorMessage: null }
    });

    // Re-queue jobs
    await addPublishJobs(post, post.platformPosts);

    return res.status(202).json({
      data: {
        message: 'Retry jobs queued',
        platforms: post.platformPosts.map(pp => pp.platform)
      },
      error: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel/Delete a post
 */
exports.delete = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const postId = req.params.id;

    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post || post.userId !== userId) {
      return res.status(404).json({
        data: null,
        error: { message: 'Post not found', code: 'NOT_FOUND' }
      });
    }

    if (post.status === 'PUBLISHED') {
      return res.status(400).json({
        data: null,
        error: { message: 'Cannot cancel a published post', code: 'CANNOT_CANCEL_PUBLISHED' }
      });
    }

    // Mark as CANCELLED
    await prisma.post.update({
      where: { id: postId },
      data: { status: 'CANCELLED' }
    });

    await prisma.platformPost.updateMany({
      where: { postId, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: { status: 'CANCELLED' }
    });

    // Logic to actually remove jobs from BullMQ queue could go here if using job IDs
    
    return res.status(200).json({
      data: { message: 'Post cancelled' },
      error: null
    });
  } catch (error) {
    next(error);
  }
};
