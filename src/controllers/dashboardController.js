import prisma from '../config/db.js'

class DashboardController {
  async getStats(req, res, next) {
    try {
      const userId = req.user.userId

      // 1. Basic counts
      const [total, published, failed] = await Promise.all([
        prisma.post.count({ where: { userId } }),
        prisma.post.count({ where: { userId, status: 'PUBLISHED' } }),
        prisma.post.count({ where: { userId, status: 'FAILED' } })
      ])

      // 2. Success rate
      const successRate = total > 0 ? ((published / total) * 100).toFixed(1) + '%' : '0.0%'

      // 3. Platform breakdown
      const platforms = await prisma.platformPost.groupBy({
        by: ['platform', 'status'],
        where: { post: { userId } },
        _count: { _all: true }
      })

      // 4. Recent activity
      const recent = await prisma.post.findMany({
        where: { userId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { platformPosts: true }
      })

      res.status(200).json({
        data: {
          metrics: { totalPosts: total, publishedPosts: published, failedPosts: failed, successRate },
          platformStats: platforms,
          recentActivity: recent
        },
        error: null
      })
    } catch (e) { next(e) }
  }
}

export default new DashboardController()
